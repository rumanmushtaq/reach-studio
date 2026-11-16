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

export async function googleExchange(code: string) {
  const { tokens } = await googleClient().getToken(code);
  const yt = youtube({ version: 'v3', auth: googleClient(tokens) });
  const res = await yt.channels.list({ part: ['snippet'], mine: true });
  const channel = res.data.items?.[0];
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
          return schedule ? { state: 'scheduled', runAt: video.slotAt, externalId: id, url } : { state: 'live', externalId: id, url };
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
        // At the slot YouTube has published it. Comments are off on made-for-kids videos, so no first comment.
        return { state: 'live', externalId: id, url: post.url };
      } catch (err) {
        throw mapGoogleError(err);
      }
    },
  };
}
