// Slot maths. Pure, shared by the server and the browser.
// All posting times are Pakistan time (UTC+5, no daylight saving).

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const PKT_OFFSET = 5 * HOUR;
export const TIME_ZONE = 'Asia/Karachi';

/** A slot must be at least this far away to be booked. */
export const MIN_AHEAD = HOUR;
/** YouTube and Facebook get the file this long before the slot. */
export const EARLY_UPLOAD = 6 * HOUR;
/** Instagram's Reels container is created this long before the slot. */
export const IG_STAGE = HOUR;

/** "HH:MM" on a quarter hour, because the job runner ticks every 15 minutes. */
export function isValidTime(hhmm: string): boolean {
  const m = /^([01]\d|2[0-3]):(00|15|30|45)$/.exec(hhmm);
  return m !== null;
}

export function normaliseTimes(times: string[]): string[] {
  return [...new Set(times.filter(isValidTime))].sort();
}

/** Epoch ms of 00:00 Pakistan time on the day that contains `ms`. */
export function dayStart(ms: number): number {
  const d = new Date(ms + PKT_OFFSET);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - PKT_OFFSET;
}

export function at(day: number, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return day + (h * 60 + m) * MINUTE;
}

/** The next `count` free slots, earliest first. */
export function freeSlots(opts: { times: string[]; taken: Iterable<number>; now: number; count: number }): number[] {
  const times = normaliseTimes(opts.times);
  if (!times.length) return [];
  const taken = new Set(opts.taken);
  const out: number[] = [];
  let day = dayStart(opts.now);
  for (let i = 0; i < 400 && out.length < opts.count; i++, day += DAY) {
    for (const t of times) {
      const ms = at(day, t);
      if (ms - opts.now >= MIN_AHEAD && !taken.has(ms)) {
        out.push(ms);
        if (out.length >= opts.count) break;
      }
    }
  }
  return out;
}

export function canBook(slot: number, taken: Iterable<number>, now: number): boolean {
  return slot - now >= MIN_AHEAD && !new Set(taken).has(slot);
}

const slotFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
});
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true });
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });

/** "Tue 17 Nov 7:00 PM" */
export function formatSlot(ms: number | null | undefined): string {
  if (!ms) return 'No slot';
  return slotFmt.format(new Date(ms)).replace(',', '').replace(/ (am|pm)$/i, (s) => s.toUpperCase());
}

/** "7:00 PM" */
export function formatTime(ms: number): string {
  return timeFmt.format(new Date(ms)).toUpperCase();
}

/** "Tue 17 Nov" */
export function formatDay(ms: number): string {
  return dayFmt.format(new Date(ms));
}

export function timeLabel(hhmm: string): string {
  return formatTime(at(dayStart(Date.now()), hhmm));
}
