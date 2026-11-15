import { describe, expect, it } from 'vitest';
import { firstRunAt, postsToReset, shouldDeleteFile, videoStatus, type PostLike, type VideoLike } from './plan';
import { defaultPlatforms, draftSeo, fieldUse, FIELDS, normaliseSeo, toHashtags } from './seo';
import { at, canBook, dayStart, formatDay, formatSlot, freeSlots, fromPkt, HOUR, isValidTime, DAY, MINUTE, pktDate, pktTime, slotProblem } from './slots';

// Sun 15 Nov 2026, 2:00 PM Pakistan time
const NOW = Date.UTC(2026, 10, 15, 9, 0);

describe('slots', () => {
  it('finds the day start in Pakistan time', () => {
    expect(new Date(dayStart(NOW)).toISOString()).toBe('2026-11-14T19:00:00.000Z');
  });

  it('books the next free daily slot at least an hour away', () => {
    const today7pm = at(dayStart(NOW), '19:00');
    expect(freeSlots({ times: ['19:00'], taken: [], now: NOW, count: 1 })).toEqual([today7pm]);
    expect(freeSlots({ times: ['19:00'], taken: [today7pm], now: NOW, count: 2 })).toEqual([today7pm + DAY, today7pm + 2 * DAY]);
  });

  it('skips slots less than an hour away', () => {
    const late = at(dayStart(NOW), '18:30');
    expect(freeSlots({ times: ['19:00'], taken: [], now: late, count: 1 })[0]).toBe(at(dayStart(NOW), '19:00') + DAY);
    expect(canBook(at(dayStart(NOW), '19:00'), [], late)).toBe(false);
  });

  it('orders several daily times', () => {
    const got = freeSlots({ times: ['19:00', '12:00'], taken: [], now: NOW - 3 * HOUR, count: 3 });
    expect(got.map(formatSlot)).toEqual(['Sun 15 Nov 12:00 PM', 'Sun 15 Nov 7:00 PM', 'Mon 16 Nov 12:00 PM']);
  });

  it('names the day of a slot and of a day start in Pakistan time', () => {
    const sat7pm = at(dayStart(NOW), '19:00') + 6 * DAY;
    expect(formatDay(sat7pm)).toBe('Sat 21 Nov');
    expect(formatDay(dayStart(sat7pm))).toBe('Sat 21 Nov');
  });

  it('turns a picked date and time (Pakistan time) into a slot and back', () => {
    const ms = fromPkt('2026-11-17', '19:45')!;
    expect(new Date(ms).toISOString()).toBe('2026-11-17T14:45:00.000Z');
    expect(formatSlot(ms)).toBe('Tue 17 Nov 7:45 PM');
    expect([pktDate(ms), pktTime(ms)]).toEqual(['2026-11-17', '19:45']);
    expect(fromPkt('2026-11-31', '19:00')).toBeNull();
    expect(fromPkt('2026-11-17', '19:10')).toBeNull();
    expect(fromPkt('', '19:00')).toBeNull();
  });

  it('explains why a picked time cannot be booked', () => {
    const ms = fromPkt('2026-11-17', '19:45')!;
    expect(slotProblem(ms, [], NOW)).toBeNull();
    expect(slotProblem(ms, [{ slotAt: ms, name: 'Rain Song' }], NOW)).toBe('Rain Song is already posting at this time.');
    expect(slotProblem(NOW + 30 * MINUTE, [], NOW)).toBe('Pick a time at least 1 hour from now.');
    expect(slotProblem(null, [], NOW)).toBe('Pick a date and a time.');
    expect(canBook(ms + 5 * MINUTE, [], NOW)).toBe(false);
  });

  it('accepts quarter hours only', () => {
    expect(isValidTime('19:00')).toBe(true);
    expect(isValidTime('19:45')).toBe(true);
    expect(isValidTime('19:10')).toBe(false);
    expect(isValidTime('24:00')).toBe(false);
  });
});

describe('seo', () => {
  const brief = { name: 'Leo and the Magic Lamp', note: 'Leo finds a lamp', shape: 'horizontal' as const };

  it('fills missing fields from the draft and cleans hashtags', () => {
    const seo = normaliseSeo({ youtube: { title: 'Leo ka <Jadu>', hashtags: ['urdu cartoon', '#kids'] } }, brief);
    expect(seo.youtube.title).toBe('Leo ka Jadu');
    expect(seo.youtube.hashtags).toEqual(['#urducartoon', '#kids']);
    expect(seo.tiktok.caption).toContain('Leo and the Magic Lamp');
  });

  it('accepts comma text for lists', () => {
    expect(normaliseSeo({ youtube: { tags: 'a, b ,, c' } }, brief).youtube.tags).toEqual(['a', 'b', 'c']);
    expect(toHashtags('one, #two three')).toEqual(['#one', '#twothree']);
  });

  it('keeps the draft inside every limit', () => {
    const d = draftSeo(brief) as unknown as Record<string, Record<string, string | string[]>>;
    for (const [p, defs] of Object.entries(FIELDS)) for (const f of defs) expect(fieldUse(d[p][f.key], f).over).toBe(false);
  });

  it('sends short vertical videos everywhere and long ones to YouTube and Facebook', () => {
    expect(defaultPlatforms('vertical', 45)).toEqual({ youtube: true, facebook: true, instagram: true, tiktok: true });
    expect(defaultPlatforms('horizontal', 372)).toEqual({ youtube: true, facebook: true, instagram: false, tiktok: false });
  });
});

describe('posting plan', () => {
  const slot = at(dayStart(NOW), '19:00') + DAY;
  const all = { youtube: true, facebook: true, instagram: true, tiktok: true };
  const post = (platform: PostLike['platform'], state: PostLike['state'], updatedAt = NOW): PostLike =>
    ({ platform, state, runAt: 0, attempts: 0, lastError: null, url: null, updatedAt });
  const video = (over: Partial<VideoLike> = {}): VideoLike =>
    ({ uploadState: 'ready', seoState: 'ready', slotAt: slot, platforms: all, fileDeletedAt: null, ...over });

  it('uploads YouTube and Facebook 6 hours early, stages Instagram 1 hour early, posts TikTok on time', () => {
    expect(firstRunAt('youtube', slot, NOW)).toBe(slot - 6 * HOUR);
    expect(firstRunAt('instagram', slot, NOW)).toBe(slot - HOUR);
    expect(firstRunAt('tiktok', slot, NOW)).toBe(slot);
    expect(firstRunAt('youtube', NOW + HOUR, NOW)).toBe(NOW);
  });

  it('never resets live posts', () => {
    const r = postsToReset({ ...all, tiktok: false }, [post('youtube', 'live'), post('tiktok', 'waiting')]);
    expect(r.create).toEqual(['facebook', 'instagram']);
    expect(r.remove).toEqual(['tiktok']);
  });

  it('reports status from the posts', () => {
    expect(videoStatus(video(), [post('youtube', 'waiting')], NOW).label).toBe('Scheduled');
    expect(videoStatus(video(), [post('youtube', 'scheduled')], NOW).label).toBe('Uploaded early');
    expect(videoStatus(video(), [post('youtube', 'failed')], NOW).label).toBe('Post failed');
    const live = (['youtube', 'facebook', 'instagram', 'tiktok'] as const).map((p) => post(p, 'live'));
    expect(videoStatus(video(), live, NOW).label).toBe('Live');
  });

  it('deletes the file only the day after every chosen platform is live', () => {
    const v = video({ slotAt: NOW - 2 * HOUR });
    const live = (['youtube', 'facebook', 'instagram', 'tiktok'] as const).map((p) => post(p, 'live', NOW - HOUR));
    expect(shouldDeleteFile(v, live, NOW)).toBe(false);
    expect(shouldDeleteFile(v, live, NOW + DAY)).toBe(true);
    expect(shouldDeleteFile(v, [...live.slice(0, 3), post('tiktok', 'failed')], NOW + DAY)).toBe(false);
    expect(shouldDeleteFile(v, live.slice(0, 3), NOW + DAY)).toBe(false);
  });
});
