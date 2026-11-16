// "Needs you": problems the owner must act on, newest risk first. Pure, used by the menu badge and the Today page.
import type { PostLike, VideoLike } from './plan';
import { PLATFORM_NAMES, PLATFORMS, type Platform } from './seo';
import { formatSlot, HOUR } from './slots';

type V = VideoLike & { id: string; name: string; createdAt: number };
type P = PostLike & { id: string; videoId: string };

export type Attention =
  | { kind: 'failed'; key: string; platform: Platform; videoId: string; postId: string; title: string; detail: string }
  | { kind: 'account'; key: string; platform: Platform; title: string; detail: string }
  | { kind: 'upload'; key: string; videoId: string; title: string; detail: string };

export function attentionItems(videos: V[], posts: P[], connected: Record<Platform, string | null>, now: number): Attention[] {
  const out: Attention[] = [];
  const byId = new Map(videos.map((v) => [v.id, v]));

  for (const p of posts) {
    const v = byId.get(p.videoId);
    if (p.state !== 'failed' || !v || !v.platforms[p.platform]) continue;
    const live = posts.filter((x) => x.videoId === v.id && x.state === 'live' && v.platforms[x.platform]).length;
    out.push({
      kind: 'failed', key: `f-${p.id}`, platform: p.platform, videoId: v.id, postId: p.id,
      title: `${v.name} did not post to ${PLATFORM_NAMES[p.platform]}`,
      detail: [p.lastError ?? 'The post failed.', live ? `${live} other platform${live > 1 ? 's are' : ' is'} live.` : ''].filter(Boolean).join(' '),
    });
  }

  for (const platform of PLATFORMS) {
    if (connected[platform]) continue;
    const waiting = videos
      .filter((v) => v.platforms[platform] && v.slotAt && v.slotAt > now)
      .filter((v) => !posts.some((p) => p.videoId === v.id && p.platform === platform && p.state === 'live'))
      .sort((a, b) => a.slotAt! - b.slotAt!);
    if (!waiting.length) continue;
    out.push({
      kind: 'account', key: `a-${platform}`, platform,
      title: `${PLATFORM_NAMES[platform]} is not connected`,
      detail: `${waiting.length} upcoming video${waiting.length > 1 ? 's are' : ' is'} set to post there. The first goes live ${formatSlot(waiting[0].slotAt)}.`,
    });
  }

  for (const v of videos) {
    if (v.uploadState === 'uploading' && now - v.createdAt > HOUR / 2) {
      out.push({ kind: 'upload', key: `u-${v.id}`, videoId: v.id, title: `${v.name} did not finish uploading`, detail: 'Remove it and add the file again.' });
    }
  }
  return out;
}
