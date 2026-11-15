'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moveSlot } from '@/app/actions';
import { formatSlot } from '@/lib/slots';
import { useToast } from './ui';

export function FreeSlots({ free, movable }: { free: number[]; movable: { id: string; name: string; slotAt: number | null }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pick, setPick] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();

  const move = (ms: number) => {
    const id = pick[ms];
    if (!id) return toast('Choose a video first.');
    start(async () => {
      const r = await moveSlot(id, ms);
      toast(r.ok ? `Moved to ${formatSlot(ms)}` : r.error);
      router.refresh();
    });
  };

  return (
    <>
      <div className="top">
        <div><h1>Free slots</h1><p className="sub">The next open posting times. A new video always takes the first one.</p></div>
        <Link className="btn primary" href="/#addcard">+ Add video</Link>
      </div>
      <div className="card">
        {free.length === 0 && <p className="muted">No daily posting times. Add one in Settings.</p>}
        {free.map((ms, i) => (
          <div className="frow" key={ms}>
            <div><b className="mono">{formatSlot(ms)}</b>{i === 0 && <> <span className="pill sch">Next new video goes here</span></>}</div>
            <div className="inline">
              {movable.length ? (
                <>
                  <select className="input" aria-label={`Video to move to ${formatSlot(ms)}`} value={pick[ms] ?? ''} onChange={(e) => setPick((p) => ({ ...p, [ms]: e.target.value }))}>
                    <option value="">Move a video here…</option>
                    {movable.map((v) => <option key={v.id} value={v.id}>{v.name} · now {formatSlot(v.slotAt)}</option>)}
                  </select>
                  <button className="btn sm" disabled={pending} onClick={() => move(ms)}>Move</button>
                </>
              ) : <span className="small muted">Add videos to fill this slot.</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="small muted">Want more slots? Add another daily time in <Link className="copy" href="/settings">Settings</Link>, for example 12:00 PM as well as 7:00 PM.</p>
    </>
  );
}
