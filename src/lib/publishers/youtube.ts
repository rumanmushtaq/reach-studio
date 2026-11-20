import 'server-only';
import { auth, youtube, type youtube_v3 } from '@googleapis/youtube';
import { env } from '../env';
import { withLinksAndTags } from '../seo';
import { MINUTE } from '../slots';
import { AuthError, PublishError, type AccountContext, type PostJob, type Publisher } from './types';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl', // playlists and the first comment
];

export function googleRedirectUri(): string {
  return `${env.APP_URL}/api/oauth/google/callback`;
}

type Credentials = { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null };

export function googleClient(tokens?: Credentials, onTokens?: (t: Credentials) => void) {
  const client = new auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, googleRedirectUri());
  if (tokens) client.setCredentials(tokens);
  // Refreshes keep the old refresh_token; merge so it is not lost.
  if (tokens && onTokens) client.on('tokens', (fresh) => onTokens({ ...tokens, ...fresh }));
  return client;
}

export function googleAuthUrl(state: string): string {
  return googleClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GOOGLE_SCOPES, state });
}

/**
 * Turns the code from Google's sign-in into tokens and finds the channel. Plain fetch with time limits, so a
 * slow answer from Google ends in a clear error instead of the request running until Vercel stops it.
 */
export async function googleExchange(code: string) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(), grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e: Error) => { throw new Error(`Google did not answer the token request (${e.name === 'TimeoutError' ? 'timed out' : e.message})`); });
  const t = await tokenRes.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string; id_token?: string; error?: string; error_description?: string };
  if (!tokenRes.ok || !t.access_token) throw new Error(`Google refused the sign-in code: ${t.error_description ?? t.error ?? tokenRes.status}`);
  const tokens = {
    access_token: t.access_token, refresh_token: t.refresh_token ?? null, scope: t.scope, token_type: t.token_type,
    expiry_date: t.expires_in ? Date.now() + t.expires_in * 1000 : null,
  };

  const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { authorization: `Bearer ${t.access_token}` },
    signal: AbortSignal.timeout(15_000),
  }).catch((e: Error) => { throw new Error(`YouTube did not answer the channel lookup (${e.name === 'TimeoutError' ? 'timed out' : e.message})`); });
  const ch = await chRes.json().catch(() => ({})) as { items?: { id?: string; snippet?: { title?: string } }[]; error?: { message?: string } };
  if (!chRes.ok) throw new Error(`YouTube refused the channel lookup: ${ch.error?.message ?? chRes.status}`);
  const channel = ch.items?.[0];
  if (!channel?.id) throw new Error('This Google account has no YouTube channel');
  return { tokens, channel: { id: channel.id, title: channel.snippet?.title ?? 'YouTube channel' } };
}

type GoogleLikeError = {
  message?: string; status?: number; code?: number | string;
  response?: { status?: number; data?: { error?: { errors?: Array<{ reason?: string }> } } };
  errors?: Array<{ reason?: string }>;
};

export function mapGoogleError(err: unknown): Error {
  if (err instanceof AuthError || err instanceof PublishError) return err;
  const e = (err ?? {}) as GoogleLikeError;
  const status = e.response?.status ?? e.status;
  const message = e.message ?? 'YouTube request failed';
  const reason = e.errors?.[0]?.reason ?? e.response?.data?.error?.errors?.[0]?.reason;
  if (status === 401 || message.includes('invalid_grant')) return new AuthError('YouTube sign-in expired. Reconnect YouTube in Accounts.');
  if (reason === 'quotaExceeded' || reason === 'uploadLimitExceeded') {
    return new PublishError('YouTube daily upload limit reached. The studio tries again later.', true);
  }
  // No status = network failure.
  return new PublishError(message, status === undefined || status >= 500 || status === 429);
}

function client(ctx: AccountContext): youtube_v3.Youtube {
  return youtube({ version: 'v3', auth: googleClient(ctx.tokens, (t) => void ctx.saveTokens(t)) });
}

async function addToPlaylist(yt: youtube_v3.Youtube, videoId: string, title: string): Promise<void> {
  const name = title.trim();
  if (!name) return;
  const mine = await yt.playlists.list({ part: ['snippet'], mine: true, maxResults: 50 });
  let playlistId = mine.data.items?.find((p) => p.snippet?.title?.toLowerCase() === name.toLowerCase())?.id;
  if (!playlistId) {
    const made = await yt.playlists.insert({ part: ['snippet', 'status'], requestBody: { snippet: { title: name }, status: { privacyStatus: 'public' } } });
    playlistId = made.data.id;
  }
  if (playlistId) {
    await yt.playlistItems.insert({ part: ['snippet'], requestBody: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } } });
  }
}

// YouTube makes every video uploaded through an app private until Google has audited that app.
const KEPT_PRIVATE = 'YouTube kept this video private, so it is not live. YouTube does this to videos uploaded by apps that Google has not audited yet. Open it in YouTube Studio and set it to Public. To stop it happening, apply for the YouTube API audit: https://support.google.com/youtube/contact/yt_api_form';
// How long after the slot YouTube may take to publish before the studio calls the video stuck.
const PUBLISH_GRACE = 30 * MINUTE;

/** Whether YouTube really published the video: live, not yet (check again soon), or why not. */
async function publishedState(yt: youtube_v3.Youtube, id: string, slotAt: number, now: number): Promise<'live' | 'soon'> {
  const { data } = await yt.videos.list({ part: ['status'], id: [id] });
  const st = data.items?.[0]?.status;
  if (!st) throw new PublishError('This video is no longer on YouTube. It may have been deleted in YouTube Studio.', false);
  if (st.uploadStatus === 'rejected' || st.uploadStatus === 'failed') {
    const why = st.rejectionReason ?? st.failureReason;
    throw new PublishError(`YouTube ${st.uploadStatus} this video${why ? ` (${why})` : ''}. See YouTube Studio.`, false);
  }
  if (st.privacyStatus === 'public' || st.privacyStatus === 'unlisted') return 'live';
  if (st.publishAt && now < slotAt + PUBLISH_GRACE) return 'soon';
  throw new PublishError(KEPT_PRIVATE, false);
}

/** Best effort: YouTube allows custom thumbnails only on verified channels. */
async function setThumbnail(yt: youtube_v3.Youtube, videoId: string, open: PostJob['openThumb']): Promise<void> {
  if (!open) return;
  await yt.thumbnails.set({ videoId, media: { mimeType: 'image/jpeg', body: await open() } }).catch(() => undefined);
}

export function createYouTubePublisher(): Publisher {
  return {
    async step(job, ctx) {
      const yt = client(ctx);
      const { video, post, now } = job;
      const seo = video.seo.youtube;
      try {
        if (post.state === 'waiting') {
          // Scheduled uploads must be private with publishAt; too close to the slot, publish now.
          const schedule = video.slotAt - now > 15 * MINUTE;
          const isShort = video.shape === 'vertical' && (video.duration ?? 0) <= 180;
          const res = await yt.videos.insert({
            part: ['snippet', 'status'],
            requestBody: {
              snippet: {
                title: seo.title.slice(0, 100),
                description: withLinksAndTags(seo.description, seo.hashtags, job.links).slice(0, 5000),
                tags: seo.tags,
                categoryId: '1', // Film & Animation
                defaultLanguage: 'ur',
                defaultAudioLanguage: 'ur',
              },
              status: {
                privacyStatus: schedule ? 'private' : 'public',
                publishAt: schedule ? new Date(video.slotAt).toISOString() : undefined,
                selfDeclaredMadeForKids: true,
              },
            },
            media: { mimeType: video.mime || 'video/mp4', body: await job.openFile() },
          });
          const id = res.data.id;
          if (!id) throw new PublishError('YouTube did not return a video id', true);
          const url = isShort ? `https://youtube.com/shorts/${id}` : `https://youtu.be/${id}`;
          await addToPlaylist(yt, id, seo.playlist).catch(() => undefined);
          await setThumbnail(yt, id, job.openThumb);
          if (schedule) return { state: 'scheduled', runAt: video.slotAt, externalId: id, url };
          if (res.data.status?.privacyStatus === 'private') throw new PublishError(KEPT_PRIVATE, false);
          return { state: 'live', externalId: id, url };
        }

        // Uploaded early. Before the slot: keep YouTube's publish time in step with the studio (the slot may have moved).
        const id = post.externalId!;
        if (now < video.slotAt - MINUTE) {
          await setThumbnail(yt, id, job.openThumb); // a thumbnail added after the early upload
          await yt.videos.update({
            part: ['status'],
            requestBody: { id, status: { privacyStatus: 'private', publishAt: new Date(video.slotAt).toISOString(), selfDeclaredMadeForKids: true } },
          });
          return { state: 'scheduled', runAt: video.slotAt, externalId: id, url: post.url };
        }
        // At the slot YouTube publishes it itself; check it did. Comments are off on made-for-kids videos.
        if (await publishedState(yt, id, video.slotAt, now) === 'soon') return { state: 'scheduled', runAt: now + 5 * MINUTE, externalId: id, url: post.url };
        return { state: 'live', externalId: id, url: post.url };
      } catch (err) {
        throw mapGoogleError(err);
      }
    },
  };
}
