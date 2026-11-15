import 'server-only';
import { env } from '../env';
import { withLinksAndTags } from '../seo';
import { MINUTE } from '../slots';
import { AuthError, PublishError, type Publisher } from './types';

export const GRAPH = 'https://graph.facebook.com';
const api = () => `${GRAPH}/${env.META_GRAPH_VERSION}`;

// A Page access token: the Facebook and Instagram publishers both post with one.
export type MetaTokens = { accessToken: string };

type GraphErrorBody = { error?: { code?: number; message?: string; is_transient?: boolean } };

export async function graphFetch(url: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new PublishError(`Could not reach Meta: ${(err as Error).message}`, true);
  }
  const body = (await res.json().catch(() => ({}))) as GraphErrorBody & Record<string, unknown>;
  if (res.ok && !body.error) return body;
  const error = body.error ?? {};
  const message = error.message ?? `Meta API error ${res.status}`;
  if (res.status === 401 || error.code === 190) throw new AuthError('Facebook sign-in expired. Reconnect Facebook in Accounts.');
  throw new PublishError(message, error.is_transient === true || res.status >= 500 || res.status === 429);
}

const form = (params: Record<string, string>) => new URLSearchParams(params);

// ---------- sign in ----------

export const META_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_engagement',
  'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'business_management',
];

export function metaRedirectUri(): string {
  return `${env.APP_URL}/api/oauth/meta/callback`;
}

export function metaAuthUrl(state: string): string {
  const params = new URLSearchParams({ client_id: env.META_APP_ID, redirect_uri: metaRedirectUri(), state, response_type: 'code' });
  if (env.META_CONFIG_ID) params.set('config_id', env.META_CONFIG_ID);
  else params.set('scope', META_SCOPES.join(','));
  return `https://www.facebook.com/${env.META_GRAPH_VERSION}/dialog/oauth?${params}`;
}

export type MetaPage = { pageId: string; pageName: string; pageToken: string; instagram: { id: string; username: string } | null };

export async function metaExchange(code: string): Promise<MetaPage[]> {
  const short = await graphFetch(`${api()}/oauth/access_token?${new URLSearchParams({
    client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: metaRedirectUri(), code,
  })}`);
  const long = await graphFetch(`${api()}/oauth/access_token?${new URLSearchParams({
    grant_type: 'fb_exchange_token', client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: short.access_token,
  })}`);
  // Page tokens fetched with a long-lived user token do not expire.
  const pages = await graphFetch(`${api()}/me/accounts?${new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: long.access_token,
  })}`);
  return (pages.data ?? []).map((page: any): MetaPage => ({
    pageId: page.id,
    pageName: page.name,
    pageToken: page.access_token,
    instagram: page.instagram_business_account
      ? { id: page.instagram_business_account.id, username: page.instagram_business_account.username }
      : null,
  }));
}

// ---------- Facebook Page ----------

export function createFacebookPublisher(): Publisher {
  return {
    async step(job, ctx) {
      const { accessToken } = ctx.tokens as MetaTokens;
      const { video, post, now } = job;
      const seo = video.seo.facebook;
      // Facebook accepts scheduled times at least 10 minutes ahead.
      const schedule = video.slotAt - now > 15 * MINUTE;

      if (post.state === 'waiting') {
        const params: Record<string, string> = {
          access_token: accessToken,
          file_url: await job.fileUrl(),
          title: seo.title.slice(0, 255),
          description: withLinksAndTags(seo.description, seo.hashtags, job.links),
          published: schedule ? 'false' : 'true',
        };
        if (schedule) params.scheduled_publish_time = String(Math.floor(video.slotAt / 1000));
        const res = await graphFetch(`${api()}/${ctx.externalId}/videos`, { method: 'POST', body: form(params) });
        const id = String(res.id);
        const url = `https://www.facebook.com/${ctx.externalId}/videos/${id}`;
        if (schedule) return { state: 'scheduled', runAt: video.slotAt, externalId: id, url };
        await firstComment(id, seo.pinned, accessToken);
        return { state: 'live', externalId: id, url };
      }

      const id = post.externalId!;
      if (now < video.slotAt - MINUTE) {
        // The slot may have moved: keep Facebook's time in step.
        await graphFetch(`${api()}/${id}`, {
          method: 'POST',
          body: form({ access_token: accessToken, scheduled_publish_time: String(Math.floor(video.slotAt / 1000)) }),
        });
        return { state: 'scheduled', runAt: video.slotAt, externalId: id, url: post.url };
      }
      await firstComment(id, seo.pinned, accessToken);
      return { state: 'live', externalId: id, url: post.url };
    },
  };
}

/** Best effort: the post is already live, so a failed comment must not fail the post. */
async function firstComment(objectId: string, text: string, accessToken: string): Promise<void> {
  if (!text.trim()) return;
  await graphFetch(`${api()}/${objectId}/comments`, { method: 'POST', body: form({ access_token: accessToken, message: text }) })
    .catch(() => undefined);
}

// ---------- Instagram Reels ----------

export function createInstagramPublisher(): Publisher {
  return {
    async step(job, ctx) {
      const { accessToken } = ctx.tokens as MetaTokens;
      const { video, post, now } = job;
      const seo = video.seo.instagram;
      const igUser = ctx.externalId;

      if (post.state === 'waiting') {
        // Instagram fetches the file itself and processes it; the container stays valid for 24 hours.
        const container = await graphFetch(`${api()}/${igUser}/media`, {
          method: 'POST',
          body: form({
            access_token: accessToken,
            media_type: 'REELS',
            video_url: await job.fileUrl(),
            caption: [seo.caption.trim(), seo.hashtags.join(' ')].filter(Boolean).join('\n\n').slice(0, 2200),
            share_to_feed: 'true',
          }),
        });
        return { state: 'staged', runAt: Math.max(now, video.slotAt), externalId: String(container.id) };
      }

      const containerId = post.externalId!;
      if (now < video.slotAt - MINUTE) return { state: 'staged', runAt: video.slotAt, externalId: containerId };
      const status = await graphFetch(`${api()}/${containerId}?${form({ fields: 'status_code,status', access_token: accessToken })}`);
      if (status.status_code === 'IN_PROGRESS') return { state: 'wait', runAt: now + 5 * MINUTE };
      if (status.status_code !== 'FINISHED') {
        throw new PublishError(`Instagram could not process the video: ${status.status ?? status.status_code}`, false);
      }
      const published = await graphFetch(`${api()}/${igUser}/media_publish`, {
        method: 'POST', body: form({ access_token: accessToken, creation_id: containerId }),
      });
      const mediaId = String(published.id);
      const permalink = await graphFetch(`${api()}/${mediaId}?${form({ fields: 'permalink', access_token: accessToken })}`)
        .then((m) => (m.permalink as string) ?? null, () => null);
      await firstComment(mediaId, seo.pinned, accessToken);
      return { state: 'live', externalId: mediaId, url: permalink };
    },
  };
}
