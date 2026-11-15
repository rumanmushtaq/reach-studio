'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addTime, removeTime, saveChannel } from '@/app/actions';
import { PLATFORM_NAMES, PLATFORMS, type Links } from '@/lib/seo';
import { QUARTER_HOURS, timeLabel } from '@/lib/slots';
import { useToast } from './ui';

export function SettingsView({ times, channel, niche, links }: { times: string[]; channel: string; niche: string; links: Links }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [newTime, setNewTime] = useState('12:00');
  const [form, setForm] = useState({ channel, niche, links });

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    toast(r.ok ? r.message ?? 'Saved' : r.error ?? 'Something went wrong');
    router.refresh();
  });

  return (
    <>
      <div className="top"><div><h1>Settings</h1><p className="sub">Set these once. They apply to every new video.</p></div></div>
      <div className="card">
        <h2>Daily posting times</h2>
        <p className="small muted">Every day gets these slots, in Pakistan time. Changing them does not move videos that are already booked.</p>
        <div className="chips">
          {times.map((t) => (
            <span className="chip" key={t}>{timeLabel(t)}
              <button aria-label={`Remove ${timeLabel(t)}`} disabled={times.length < 2 || pending} onClick={() => run(() => removeTime(t))}>×</button>
            </span>
          ))}
        </div>
        <div className="inline">
          <select className="input" value={newTime} onChange={(e) => setNewTime(e.target.value)} aria-label="New daily time">
            {QUARTER_HOURS.map((q) => <option key={q} value={q}>{timeLabel(q)}</option>)}
          </select>
          <button className="btn sm" disabled={pending} onClick={() => run(() => addTime(newTime))}>Add daily time</button>
        </div>
      </div>
      <form className="card" onSubmit={(e) => { e.preventDefault(); run(() => saveChannel(form)); }}>
        <h2>Channel</h2>
        <div className="grid2">
          <div className="field"><label htmlFor="s-channel">Channel name</label><input className="input" id="s-channel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} /></div>
          <div className="field"><label htmlFor="s-niche">What the channel is about</label><input className="input" id="s-niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} /></div>
        </div>
        <h2>Your links</h2>
        <p className="small muted">Added to the end of every YouTube and Facebook description.</p>
        <div className="grid2">
          {PLATFORMS.map((p) => (
            <div className="field" key={p}>
              <label htmlFor={`l-${p}`}>{PLATFORM_NAMES[p]} link</label>
              <input className="input" id={`l-${p}`} placeholder="https://" value={form.links[p]} onChange={(e) => setForm({ ...form, links: { ...form.links, [p]: e.target.value } })} />
            </div>
          ))}
        </div>
        <div><button className="btn primary sm" disabled={pending}>Save</button></div>
      </form>
    </>
  );
}
