'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moveSlot } from '@/app/actions';
import { at, DAY, dayStart, formatDay, formatTime, MIN_AHEAD, timeLabel } from '@/lib/slots';
import { useToast } from './ui';

export type CalVideo = { id: string; name: string; slotAt: number; live: boolean; locked: boolean };

export function Calendar({ videos, times, now }: { videos: CalVideo[]; times: string[]; now: number }) {
  const router = useRouter();
  const toast = useToast();
  const [week, setWeek] = useState(0);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [, start] = useTransition();

  const today = dayStart(now);
  const first = today + week * 7 * DAY;
  const bySlot = new Map(videos.map((v) => [v.slotAt, v]));
  const movingVideo = videos.find((v) => v.id === moving);

  const move = (id: string, ms: number) => start(async () => {
    const r = await moveSlot(id, ms);
    const name = videos.find((v) => v.id === id)?.name ?? 'Video';
    toast(r.ok ? `${name} moved to ${formatDay(ms)} ${formatTime(ms)}` : r.error);
    setMoving(null);
    router.refresh();
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d0 = first + i * DAY;
    const slots = new Set(times.map((t) => at(d0, t)));
    for (const v of videos) if (v.slotAt >= d0 && v.slotAt < d0 + DAY) slots.add(v.slotAt);
    return { d0, slots: [...slots].sort((a, b) => a - b) };
  });

  return (
    <>
      <div className="top">
        <div><h1>Calendar</h1><p className="sub">Drag a video to a free slot, or tap the video and then tap a free slot.</p></div>
        <Link className="btn primary" href="/#addcard">+ Add video</Link>
      </div>
      {movingVideo && (
        <div className="banner accent"><span>Moving <b>{movingVideo.name}</b>. Tap a green free slot.</span><button className="btn sm" onClick={() => setMoving(null)}>Cancel</button></div>
      )}
      <div className="calbar">
        <div className="inline">
          <button className="btn sm" disabled={week <= 0} onClick={() => setWeek((w) => Math.max(0, w - 1))}>← Earlier</button>
          <button className="btn sm" onClick={() => setWeek(0)}>This week</button>
          <button className="btn sm" onClick={() => setWeek((w) => w + 1)}>Later →</button>
        </div>
        <span className="small muted">Daily slots: {times.map(timeLabel).join(', ')} PKT · <Link className="copy" href="/settings">Change</Link></span>
      </div>
      <div className="calscroll">
        <div className="cal">
          {days.map(({ d0, slots }) => (
            <div key={d0} className={`day ${d0 === today ? 'today' : ''}`}>
              <span className="dn"><span>{formatDay(d0).toUpperCase()}</span>{d0 === today && <span>today</span>}</span>
              {slots.map((ms) => {
                const v = bySlot.get(ms);
                if (v) {
                  const fixed = v.live || v.locked;
                  return (
                    <button
                      key={ms}
                      className={`slot ${v.live ? 'live' : 'booked'} ${moving === v.id ? 'sel' : ''}`}
                      draggable={!fixed}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', v.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onClick={() => (fixed || moving === v.id ? router.push(`/videos/${v.id}`) : setMoving(v.id))}
                      title={v.name}
                    >
                      <span className="tm">{formatTime(ms)}{v.live ? ' · live' : v.locked ? ' · uploaded' : ''}</span>
                      <span className="nm">{v.name}</span>
                    </button>
                  );
                }
                if (ms - now < MIN_AHEAD) {
                  return <div key={ms} className="slot past"><span className="tm">{formatTime(ms)}</span><span className="nm">{ms < now ? 'passed' : 'too soon'}</span></div>;
                }
                return (
                  <button
                    key={ms}
                    className={`slot free ${moving ? 'target' : ''} ${dragOver === ms ? 'dragover' : ''}`}
                    onClick={() => (moving ? move(moving, ms) : toast('Tap a video first, then tap this free slot.'))}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(ms); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) move(id, ms); }}
                  >
                    <span className="tm">{formatTime(ms)}</span><span className="nm">{moving ? 'Move here' : 'Free'}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
