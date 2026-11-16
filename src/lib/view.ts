import 'server-only';
import { cache } from 'react';
import { has } from './env';
import type { Platform } from './seo';
import { PLATFORMS } from './seo';
import * as repo from './repo';
import { downloadUrl } from './storage';

// Everything the screens need, as plain data for client components. Cached per request.
export const studioData = cache(async () => {
  const [settings, videos, posts, accounts] = await Promise.all([repo.getSettings(), repo.listVideos(), repo.listPosts(), repo.listAccounts()]);
  const thumbs: Record<string, string> = {};
  const customThumbs: Record<string, string> = {};
  await Promise.all(videos.map(async (v) => {
    if (v.thumbKey) thumbs[v.id] = await downloadUrl(v.thumbKey, 3600);
    if (v.customThumbKey) customThumbs[v.id] = await downloadUrl(v.customThumbKey, 3600);
  }));
  const connected = Object.fromEntries(PLATFORMS.map((p) => [p, accounts.find((a) => a.platform === p)?.name ?? null])) as Record<Platform, string | null>;
  return {
    now: Date.now(),
    settings,
    videos,
    posts,
    thumbs,
    customThumbs,
    connected,
    setup: { claude: has.claude(), storage: has.storage(), google: has.google(), meta: has.meta() },
  };
});

export type StudioData = Awaited<ReturnType<typeof studioData>>;
