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
  return isQuarterHour(slot) && slot - now >= MIN_AHEAD && !new Set(taken).has(slot);
}

/** The job runner ticks every 15 minutes, so a chosen time must sit on a quarter hour. */
export function isQuarterHour(ms: number): boolean {
  return Number.isInteger(ms) && ms % (15 * MINUTE) === 0;
}

/** "2026-11-17" + "19:00" in Pakistan time → epoch ms. Null for an invalid date or a time off the quarter hour. */
export function fromPkt(date: string, hhmm: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m || !isValidTime(hhmm)) return null;
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(day).getUTCDate() !== Number(m[3])) return null; // e.g. 31 Nov
  return at(day - PKT_OFFSET, hhmm);
}

/** Epoch ms → "2026-11-17" in Pakistan time, for date inputs. */
export function pktDate(ms: number): string {
  return new Date(ms + PKT_OFFSET).toISOString().slice(0, 10);
}

/** Epoch ms → "19:00" in Pakistan time. */
export function pktTime(ms: number): string {
  return new Date(ms + PKT_OFFSET).toISOString().slice(11, 16);
}

/** Every quarter hour of the day, "00:00" … "23:45". */
export const QUARTER_HOURS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

/** Why a chosen time cannot be booked, or null when it can. */
export function slotProblem(slot: number | null, taken: { slotAt: number; name: string }[], now: number): string | null {
  if (slot === null || !isQuarterHour(slot)) return 'Pick a date and a time.';
  if (slot - now < MIN_AHEAD) return 'Pick a time at least 1 hour from now.';
  const other = taken.find((t) => t.slotAt === slot);
  if (other) return `${other.name} is already posting at this time.`;
  return null;
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
