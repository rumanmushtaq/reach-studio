'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moveSlot } from '@/app/actions';
import { at, DAY, dayStart, formatDay, formatSlot, formatTime, MIN_AHEAD, normaliseTimes, pktTime, timeLabel } from '@/lib/slots';
import { Icon, useToast } from './ui';

export type CalVideo = { id: string; name: string; slotAt: number; fixed: boolean; live: boolean; platforms: string };

export function Calendar({ videos, times, now }: { videos: CalVideo[]; times: string[]; now: number }) {
  const router = useRouter();
  const toast = useToast();
  const [week, setWeek] = useState(0);
  const [moving, setMoving] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [, start] = useTransition();

  const daily = normaliseTimes(times);
  const today = dayStart(now);
  const first = today + week * 7 * DAY;
  const days = Array.from({ length: 7 }, (_, i) => first + i * DAY);
  const bySlot = new Map(videos.map((v) => [v.slotAt, v]));
  const movingVideo = videos.find((v) => v.id === moving);

  const move = (id: string, to: number) => start(async () => {
    const v = videos.find((x) => x.id === id);
    setMoving(null);
    const r = await moveSlot(id, to);
    if (!r.ok) toast(r.error);
    else toast(`Moved ${v?.name ?? 'video'} to ${formatSlot(to)}`, v ? { label: 'Undo', run: () => void moveSlot(id, v.slotAt).then(() => router.refresh()) } : undefined);
    router.refresh();
  });

  const cell = (ms: number) => {
    const v = bySlot.get(ms);
    if (v) {
      const cls = v.fixed ? 'fixed' : moving === v.id ? 'sel' : daily.includes(pktTime(ms)) ? 'booked' : 'picked';
      return (
        <button
          className={`wcell ${cls}`}
          draggable={!v.fixed}
          onDragStart={(e) => { e.dataTransfer.setData('text/plain', v.id); e.dataTransfer.effectAllowed = 'move'; }}
          onClick={() => (v.fixed || moving === v.id ? router.push(`/videos/${v.id}`) : setMoving(v.id))}
          aria-label={`${v.name}, ${formatSlot(ms)}${v.fixed ? ', fixed' : ', press to move'}`}
        >
          <b>{v.name}</b>
          <small>{v.live ? 'live' : v.fixed ? 'posting' : moving === v.id ? 'moving…' : cls === 'picked' ? `${formatTime(ms)} · picked` : v.platforms}</small>
        </button>
      );
    }
    if (ms - now < MIN_AHEAD) return <div className="wcell past">{ms < now ? 'passed' : 'too soon'}</div>;
    return (
      <button
        className={`wcell free ${moving ? 'target' : ''} ${over === ms ? 'over' : ''}`}
        onClick={() => (moving ? move(moving, ms) : router.push(`/upload?at=${ms}`))}
        onDragOver={(e) => { e.preventDefault(); setOver(ms); }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) move(id, ms); }}
        aria-label={moving ? `Move here: ${formatSlot(ms)}` : `Free slot ${formatSlot(ms)}: add a video`}
      >
        {over === ms || moving ? 'Drop here' : 'Free'}
      </button>
    );
  };

  // Videos at times that are not daily slots (picked by the owner) get their own row.
  const picked = days.map((d) => videos.filter((v) => v.slotAt >= d && v.slotAt < d + DAY && !daily.includes(pktTime(v.slotAt))));
  const pickedRows = Math.max(0, ...picked.map((p) => p.length));
  const label = `${formatDay(days[0]).slice(4)} – ${formatDay(days[6]).slice(4)}`.toUpperCase();

  return (
    <>
      <header className="head">
        <div>
          <h1>Planner</h1>
          <p className="small muted">Drag a video onto a free slot, or tap the video and then tap the slot.</p>
        </div>
        <div className="actions">
          <button className="btn" aria-label="Previous week" disabled={week <= 0} onClick={() => setWeek((w) => Math.max(0, w - 1))}><Icon name="back" size={18} /></button>
          <span className="mono" style={{ fontWeight: 700 }}>{label}</span>
          <button className="btn" aria-label="Next week" onClick={() => setWeek((w) => w + 1)}><Icon name="next" size={18} /></button>
          {week > 0 && <button className="btn" onClick={() => setWeek(0)}>This week</button>}
          <Link className="btn primary" href="/upload"><Icon name="plus" size={18} stroke={2.4} />Add videos</Link>
        </div>
      </header>

      {movingVideo && (
        <div className="banner warn"><span>Moving <b>{movingVideo.name}</b>. Tap a green free slot.</span><button className="btn sm" onClick={() => setMoving(null)}>Cancel</button></div>
      )}

      <div className="week">
        <div className="grid">
          <span className="dh" />
          {days.map((d) => (
            <span key={d} className={`dh ${d === today ? 'today' : ''}`}>{formatDay(d).toUpperCase()}{d === today && <small>TODAY</small>}</span>
          ))}
          {daily.map((t) => (
            <div key={t} style={{ display: 'contents' }}>
              <span className="th">{timeLabel(t)}</span>
              {days.map((d) => <div key={d} className={`c ${d === today ? 'today' : ''}`}>{cell(at(d, t))}</div>)}
            </div>
          ))}
          {Array.from({ length: pickedRows }, (_, row) => (
            <div key={`p${row}`} style={{ display: 'contents' }}>
              <span className="th">{row === 0 ? 'Picked times' : ''}</span>
              {days.map((d, i) => <div key={d} className={`c ${d === today ? 'today' : ''}`}>{picked[i][row] ? cell(picked[i][row].slotAt) : null}</div>)}
            </div>
          ))}
        </div>
      </div>
      <div className="key" aria-label="Key">
        <span><i style={{ background: 'var(--info-soft)' }} />Booked: drag to move</span>
        <span><i style={{ background: 'var(--violet-soft)' }} />Your picked time</span>
        <span><i style={{ background: 'var(--navy)' }} />Live or posting now</span>
        <span><i style={{ border: '1.5px dashed var(--ok-line)' }} />Free: tap to add a video</span>
        <span className="muted">Daily slots {daily.map(timeLabel).join(', ')} Pakistan time · <Link href="/settings">Change</Link> · every move can be undone</span>
      </div>
    </>
  );
}
