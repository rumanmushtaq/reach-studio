'use client';

import { formatSlot, fromPkt, pktDate, pktTime, QUARTER_HOURS, slotProblem, timeLabel } from '@/lib/slots';

export type Taken = { slotAt: number; name: string };

/** Date + time (Pakistan time, quarter hours) with a live "free / taken / too soon" line. */
export function SlotPicker({ value, onChange, taken, now, idPrefix }: {
  value: number | null;
  onChange: (ms: number | null) => void;
  taken: Taken[];
  now: number;
  idPrefix: string;
}) {
  const date = value ? pktDate(value) : '';
  const time = value ? pktTime(value) : '19:00';
  const problem = slotProblem(value, taken, now);
  return (
    <div className="field">
      <div className="inline">
        <input
          className="input" type="date" id={`${idPrefix}-date`} aria-label="Posting date" value={date} min={pktDate(now)}
          onChange={(e) => onChange(fromPkt(e.target.value, time))}
        />
        <select
          className="input" id={`${idPrefix}-time`} aria-label="Posting time" value={time}
          onChange={(e) => onChange(fromPkt(date || pktDate(now), e.target.value))}
        >
          {QUARTER_HOURS.map((q) => <option key={q} value={q}>{timeLabel(q)}</option>)}
        </select>
        <span className="small muted">Pakistan time</span>
      </div>
      <span className={`small ${problem ? 'err' : 'muted'}`} role="status">
        {problem ?? <>Free: goes live <b>{formatSlot(value)}</b>.</>}
      </span>
    </div>
  );
}
