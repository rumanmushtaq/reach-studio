'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addTime, removeTime, saveChannel } from '@/app/actions';
import { PLATFORM_NAMES, PLATFORMS, type Links } from '@/lib/seo';
import { QUARTER_HOURS, timeLabel } from '@/lib/slots';
import { PlatformBadge, useToast } from './ui';

export function SettingsView({ times, channel, niche, links }: { times: string[]; channel: string; niche: string; links: Links }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [newTime, setNewTime] = useState('12:00');
  const [form, setForm] = useState({ channel, niche, links });
  const dirty = form.channel !== channel || form.niche !== niche || PLATFORMS.some((p) => form.links[p] !== links[p]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    toast(r.ok ? r.message ?? 'Saved' : r.error ?? 'Something went wrong');
    router.refresh();
  });

  return (
    <>
      <header className="head"><div><h1>Settings</h1><p className="small muted">Set these once. They apply to every new video.</p></div></header>

      <section className="card" aria-labelledby="times">
        <h2 id="times">Daily posting times</h2>
        <p className="small muted">Every day gets these slots, in Pakistan time. New videos take the next free one. Changing them does not move videos already booked.</p>
        <div className="timechips">
          {times.map((t) => (
            <span className="timechip" key={t}>{timeLabel(t)}
              <button aria-label={`Remove ${timeLabel(t)}`} disabled={times.length < 2 || pending} onClick={() => run(() => removeTime(t))}>×</button>
            </span>
          ))}
        </div>
        <div className="inline">
          <label><span className="sr-only">New daily time</span>
            <select className="input" value={newTime} onChange={(e) => setNewTime(e.target.value)} aria-label="New daily time">
              {QUARTER_HOURS.map((q) => <option key={q} value={q}>{timeLabel(q)}</option>)}
            </select>
          </label>
          <button className="btn" disabled={pending} onClick={() => run(() => addTime(newTime))}>Add daily time</button>
        </div>
      </section>

      <form className="card" onSubmit={(e) => { e.preventDefault(); run(() => saveChannel(form)); }} aria-labelledby="chan">
        <h2 id="chan">Channel</h2>
        <p className="small muted">Claude uses these when it writes titles and descriptions.</p>
        <div className="grid2">
          <div className="field"><label htmlFor="s-channel">Channel name</label><input className="input" id="s-channel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} /></div>
          <div className="field"><label htmlFor="s-niche">What the channel is about</label><input className="input" id="s-niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} /></div>
        </div>
        <h2 style={{ marginTop: 8 }}>Your links</h2>
        <p className="small muted">Added to the end of every YouTube and Facebook description, so viewers find your other channels.</p>
        <div className="grid2">
          {PLATFORMS.map((p) => (
            <div className="field" key={p}>
              <label htmlFor={`l-${p}`}><span className="inline"><PlatformBadge p={p} small />{PLATFORM_NAMES[p]} link</span></label>
              <input className="input" id={`l-${p}`} type="url" placeholder="https://" value={form.links[p]} onChange={(e) => setForm({ ...form, links: { ...form.links, [p]: e.target.value } })} />
            </div>
          ))}
        </div>
        <div className="inline">
          <button className="btn primary" disabled={pending || !dirty}>Save</button>
          {dirty && <span className="small muted">Unsaved changes</span>}
        </div>
      </form>
    </>
  );
}
