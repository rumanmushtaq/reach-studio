import { describe, expect, it } from 'vitest';
import { reachChecks } from './reach';
import { draftSeo } from './seo';
import { at, countdown, dayStart, DAY, formatSlot, HOUR, MINUTE, tonightSlot, weekendSlots } from './slots';

const NOW = Date.UTC(2026, 10, 15, 9, 0); // Sun 15 Nov 2026, 2:00 PM Pakistan time
const seo = draftSeo({ name: 'Leo and the Magic Lamp', note: 'Leo finds a lamp', shape: 'horizontal' });

describe('reach checklist', () => {
  it('passes the draft on everything but links and thumbnail', () => {
    const checks = reachChecks('youtube', seo, { links: {}, customThumb: false });
    expect(checks.filter((c) => !c.ok).map((c) => c.text)).toEqual([
      'Add more tags: aim for 15 or more',
      'Add your channel links in Settings',
      'Upload a custom thumbnail: it shows bigger than the title',
    ]);
    const done = reachChecks('youtube', { ...seo, youtube: { ...seo.youtube, tags: [...seo.youtube.tags, ...'abcdefgh'.split('')] } },
      { links: { youtube: 'https://youtube.com/@leo' }, customThumb: true });
    expect(done.every((c) => c.ok)).toBe(true);
  });

  it('flags limits on each platform', () => {
    const long = { ...seo, youtube: { ...seo.youtube, title: 'x'.repeat(120) }, instagram: { ...seo.instagram, hashtags: [] } };
    expect(reachChecks('youtube', long, { links: {}, customThumb: false })[0]).toEqual({ ok: false, text: 'Title is over 100 characters: YouTube cuts it' });
    expect(reachChecks('instagram', long, { links: {}, customThumb: false })[1].ok).toBe(false);
    expect(reachChecks('tiktok', seo, { links: {}, customThumb: false }).every((c) => c.ok)).toBe(true);
  });
});

describe('quick times', () => {
  it('offers the first free evening time tonight', () => {
    expect(formatSlot(tonightSlot([], NOW)!)).toBe('Sun 15 Nov 7:00 PM');
    expect(formatSlot(tonightSlot([at(dayStart(NOW), '19:00')], NOW)!)).toBe('Sun 15 Nov 8:00 PM');
    expect(tonightSlot([], at(dayStart(NOW), '21:30'))).toBeNull();
  });

  it('offers free weekend slots: on Sunday only today is left', () => {
    expect(weekendSlots(['19:00'], [], NOW).map(formatSlot)).toEqual(['Sun 15 Nov 7:00 PM']);
    const wed = NOW + 3 * DAY;
    expect(weekendSlots(['12:00', '19:00'], [at(dayStart(wed), '12:00') + 3 * DAY], wed).map(formatSlot))
      .toEqual(['Sat 21 Nov 7:00 PM', 'Sun 22 Nov 12:00 PM', 'Sun 22 Nov 7:00 PM']);
  });

  it('counts down', () => {
    expect(countdown(NOW + 45 * MINUTE, NOW)).toBe('in 45 m');
    expect(countdown(NOW + 2 * HOUR + 12 * MINUTE, NOW)).toBe('in 2 h 12 m');
    expect(countdown(NOW + 4 * DAY, NOW)).toBe('in 4 days');
  });
});
