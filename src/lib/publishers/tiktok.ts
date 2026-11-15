import 'server-only';
import { AuthError, PublishError, type Publisher } from './types';

// TikTok goes through Upload-Post (upload-post.com): TikTok blocks public posts from apps it has not audited.
export type UploadPostTokens = { apiKey: string; user: string };

const BASE = 'https://api.upload-post.com';

export function createTikTokPublisher(): Publisher {
  return {
    async step(job, ctx) {
      const tokens = ctx.tokens as UploadPostTokens;
      const seo = job.video.seo.tiktok;
      const body = new FormData();
      body.append('user', tokens.user);
      body.append('platform[]', 'tiktok');
      body.append('title', [seo.caption.trim(), seo.hashtags.join(' ')].filter(Boolean).join(' ').slice(0, 2200));
      // Upload-Post downloads the file from this link, so the studio never streams it through Vercel.
      body.append('video', await job.fileUrl());

      let res: Response;
      try {
        res = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { Authorization: `Apikey ${tokens.apiKey}` }, body });
      } catch (err) {
        throw new PublishError(`Could not reach Upload-Post: ${(err as Error).message}`, true);
      }
      const out = (await res.json().catch(() => ({}))) as {
        success?: boolean; error?: string; message?: string;
        results?: { tiktok?: { success: boolean; url?: string; error?: string } };
      };
      if (res.status === 401 || res.status === 403) throw new AuthError('Upload-Post rejected the API key. Reconnect TikTok in Accounts.');
      if (!res.ok) throw new PublishError(out.error ?? out.message ?? `Upload-Post error ${res.status}`, res.status >= 500 || res.status === 429);
      const tiktok = out.results?.tiktok;
      if (!tiktok && out.success === false) throw new PublishError(out.message ?? out.error ?? 'Upload-Post rejected the upload', false);
      if (tiktok && !tiktok.success) throw new PublishError(tiktok.error ?? 'TikTok upload failed', false);
      // Long uploads finish in the background; the post appears on TikTok a little later.
      return { state: 'live', url: tiktok?.url ?? null };
    },
  };
}
