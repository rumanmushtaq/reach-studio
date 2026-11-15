// Post planning and video status. Pure, shared by the server and the browser.
import type { Platform } from './seo';
import { PLATFORMS } from './seo';
import { dayStart, EARLY_UPLOAD, IG_STAGE, MINUTE } from './slots';

export type PostLike = {
  platform: Platform;
  state: 'waiting' | 'staged' | 'scheduled' | 'live' | 'failed';
  runAt: number;
  attempts: number;
  lastError: string | null;
  url: string | null;
  updatedAt: number;
};

export type VideoLike = {
  uploadState: 'uploading' | 'ready';
  seoState: 'pending' | 'working' | 'ready';
  slotAt: number | null;
  platforms: Record<Platform, boolean>;
  fileDeletedAt: number | null;
};

export const MAX_ATTEMPTS = 4;

/** When the first job for a platform runs. */
export function firstRunAt(platform: Platform, slot: number, now: number): number {
  const lead = platform === 'youtube' || platform === 'facebook' ? EARLY_UPLOAD : platform === 'instagram' ? IG_STAGE : 0;
  return Math.max(now, slot - lead);
}

export function retryAt(attempts: number, now: number): number {
  return now + 15 * MINUTE * attempts;
}

/** Platforms whose post rows must be (re)made when a slot is booked or moved. Live posts are never touched. */
export function postsToReset(chosen: Record<Platform, boolean>, existing: PostLike[]): { create: Platform[]; remove: Platform[] } {
  const have = new Map(existing.map((p) => [p.platform, p]));
  const create: Platform[] = [];
  const remove: Platform[] = [];
  for (const p of PLATFORMS) {
    const row = have.get(p);
    if (chosen[p] && row?.state !== 'live') create.push(p);
    if (!chosen[p] && row && row.state !== 'live') remove.push(p);
  }
  return { create, remove };
}

/** True once early uploads have begun: slot and platforms are frozen. */
export function isLocked(v: VideoLike, posts: PostLike[]): boolean {
  return posts.some((p) => p.state === 'scheduled' || p.state === 'staged' || p.state === 'live');
}

export type Tone = 'seo' | 'sch' | 'up' | 'live' | 'fail';
export type Status = { label: string; tone: Tone; busy?: boolean };

export function videoStatus(v: VideoLike, posts: PostLike[], now: number): Status {
  if (v.uploadState === 'uploading') return { label: 'Uploading…', tone: 'seo', busy: true };
  if (v.seoState !== 'ready') return { label: 'Writing SEO…', tone: 'seo', busy: true };
  if (!v.slotAt) return { label: 'Needs a slot', tone: 'fail' };
  const chosen = posts.filter((p) => v.platforms[p.platform]);
  if (chosen.some((p) => p.state === 'failed')) return { label: 'Post failed', tone: 'fail' };
  if (chosen.length && chosen.every((p) => p.state === 'live')) return { label: 'Live', tone: 'live' };
  if (chosen.some((p) => p.state === 'live')) return { label: 'Going live…', tone: 'up', busy: true };
  if (chosen.some((p) => p.state === 'scheduled' || p.state === 'staged')) return { label: 'Uploaded early', tone: 'up' };
  if (now >= v.slotAt) return { label: 'Posting…', tone: 'up', busy: true };
  return { label: 'Scheduled', tone: 'sch' };
}

/** Next-day cleanup: the file goes once every chosen platform is live and the last went live before today. */
export function shouldDeleteFile(v: VideoLike, posts: PostLike[], now: number): boolean {
  if (v.fileDeletedAt || v.uploadState !== 'ready') return false;
  const chosen = posts.filter((p) => v.platforms[p.platform]);
  if (!chosen.length || chosen.length !== PLATFORMS.filter((p) => v.platforms[p]).length) return false;
  if (!chosen.every((p) => p.state === 'live')) return false;
  const lastLive = Math.max(...chosen.map((p) => Math.max(p.updatedAt, v.slotAt ?? 0)));
  return lastLive < dayStart(now);
}
