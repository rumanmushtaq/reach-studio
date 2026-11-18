// What the Today page and phone list show: videos and free slots grouped by day, plus per-platform chips.
// Pure, shared by the server and the browser.
import type { PostLike, VideoLike } from './plan';
import { PLATFORM_SHORT, PLATFORMS, type Platform } from './seo';
import { at, DAY, dayStart, formatDay, formatTime, MIN_AHEAD, normaliseTimes } from './slots';

type V = VideoLike & { id: string; name: string };
type P = PostLike & { videoId: string };

export type ChipTone = '' | 'up' | 'live' | 'fail' | 'warn';
export type Chip = { platform: Platform; short: string; text: string; tone: ChipTone };

/** One chip per chosen platform, saying where that post stands. */
export function platformChips(v: V, posts: P[], connected: Record<Platform, string | null>, now: number): Chip[] {
  return PLATFORMS.filter((p) => v.platforms[p]).map((p) => {
    const post = posts.find((x) => x.videoId === v.id && x.platform === p);
    const chip = (text: string, tone: ChipTone): Chip => ({ platform: p, short: PLATFORM_SHORT[p], text, tone });
    if (post?.state === 'live') return chip('live', 'live');
    if (!connected[p]) return chip('not connected', 'warn'); // its posts wait for the account
    if (post?.state === 'failed') return chip('failed', 'fail');
    if (post?.state === 'scheduled') return chip('uploaded', 'up');
    if (post?.state === 'staged') return chip('ready', 'up');
    if (v.seoState !== 'ready') return chip('waits for SEO', '');
    if (post && post.runAt > now) return chip(`${p === 'tiktok' ? 'posts' : p === 'instagram' ? 'prepares' : 'uploads'} ${formatTime(post.runAt)}`, '');
    return chip(p === 'tiktok' ? 'posting is due' : 'upload is due', 'warn');
  });
}

export type DayGroup<T extends V = V> = {
  day: number;
  label: string; // "Today · Sun 15 Nov"
  rows: ({ kind: 'video'; at: number; video: T } | { kind: 'free'; at: number })[];
};

/** The next `days` days: every booked video and, for the first `freeDays` days, every free daily slot. */
export function scheduleDays<T extends V>(videos: T[], times: string[], now: number, days = 7, freeDays = 3): DayGroup<T>[] {
  const today = dayStart(now);
  const out: DayGroup<T>[] = [];
  for (let i = 0; i < days; i++) {
    const day = today + i * DAY;
    const booked = videos.filter((v) => v.slotAt && v.slotAt >= day && v.slotAt < day + DAY);
    const taken = new Set(booked.map((v) => v.slotAt));
    const rows: DayGroup<T>['rows'] = booked.map((v) => ({ kind: 'video' as const, at: v.slotAt!, video: v }));
    if (i < freeDays) {
      for (const t of normaliseTimes(times)) {
        const ms = at(day, t);
        if (!taken.has(ms) && ms - now >= MIN_AHEAD) rows.push({ kind: 'free', at: ms });
      }
    }
    rows.sort((a, b) => a.at - b.at);
    if (!rows.length) continue;
    const label = i === 0 ? `Today · ${formatDay(day)}` : i === 1 ? `Tomorrow · ${formatDay(day)}` : formatDay(day);
    out.push({ day, label, rows });
  }
  return out;
}

/** Per day for the next 7 days: how full the daily slots are. */
export function weekFill(videos: V[], times: string[], now: number): { day: number; label: string; fill: 'full' | 'part' | 'free' | 'past' }[] {
  const today = dayStart(now);
  const daily = normaliseTimes(times);
  return Array.from({ length: 7 }, (_, i) => {
    const day = today + i * DAY;
    const booked = videos.filter((v) => v.slotAt && v.slotAt >= day && v.slotAt < day + DAY).length;
    const open = daily.filter((t) => at(day, t) - now >= MIN_AHEAD).length;
    const fill = booked >= daily.length ? 'full' : booked > 0 ? 'part' : open ? 'free' : 'past';
    return { day, label: formatDay(day).slice(0, 3).toUpperCase(), fill };
  });
}
