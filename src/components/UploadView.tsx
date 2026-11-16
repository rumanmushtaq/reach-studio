'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { deleteVideo } from '@/app/actions';
import { put, readVideo, titleFromFile } from '@/lib/browser-video';
import { formatSlot, formatTime, slotProblem } from '@/lib/slots';
import { SlotPicker, type Taken } from './SlotPicker';
import { Icon, useToast } from './ui';

type Mode = 'next' | 'tonight' | 'weekend' | 'pick';
type Stage = 'read' | 'upload' | 'seo' | 'booked' | 'failed';
type Job = {
  key: number; name: string; size: number; thumb?: string; vertical: boolean;
  stage: Stage; progress: number; error?: string; id?: string; slotAt?: number | null; abort?: () => void;
};

const STEPS: { stage: Stage; label: string }[] = [
  { stage: 'read', label: 'Read' }, { stage: 'upload', label: 'Uploaded' }, { stage: 'seo', label: 'SEO' }, { stage: 'booked', label: 'Booked' },
];
const ORDER: Stage[] = ['read', 'upload', 'seo', 'booked'];

export function UploadView({ nextFree, tonight, weekend, taken, now, preset }: {
  nextFree: number[]; tonight: number | null; weekend: number[]; taken: Taken[]; now: number; preset: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(preset ? 'pick' : 'next');
  const [picked, setPicked] = useState<number | null>(preset ?? nextFree[0] ?? null);
  const [note, setNote] = useState('');
  const [over, setOver] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const seq = useRef(0);

  const update = (key: number, patch: Partial<Job>) => setJobs((l) => l.map((j) => (j.key === key ? { ...j, ...patch } : j)));

  // Watch videos waiting for SEO and booking.
  useEffect(() => {
    const waiting = jobs.filter((j) => j.stage === 'seo' && j.id);
    if (!waiting.length) return;
    const t = setInterval(async () => {
      for (const j of waiting) {
        const r = await fetch(`/api/videos/${j.id}/state`).then((x) => x.json()).catch(() => null);
        if (r?.seoState === 'ready' && r.slotAt) update(j.key, { stage: 'booked', slotAt: r.slotAt });
      }
    }, 3000);
    return () => clearInterval(t);
  }, [jobs]);

  function slotsFor(count: number): (number | null)[] {
    if (mode === 'tonight') return [tonight, ...Array(count - 1).fill(null)];
    if (mode === 'pick') return [picked, ...Array(count - 1).fill(null)];
    if (mode === 'weekend') return Array.from({ length: count }, (_, i) => weekend[i] ?? null);
    return Array(count).fill(null);
  }

  async function add(files: File[]) {
    const vids = files.filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name));
    if (!vids.length) return toast('Choose a video file: mp4, mov or webm.');
    if (mode === 'pick') {
      const problem = slotProblem(picked, taken, Date.now());
      if (problem) return toast(problem);
    }
    const slots = slotsFor(vids.length);
    const text = vids.length === 1 ? note.trim() : '';
    setNote('');
    const made = vids.map((f) => ({ key: ++seq.current, file: f }));
    setJobs((l) => [...made.map(({ key, file }) => ({ key, name: titleFromFile(file.name), size: file.size, vertical: false, stage: 'read' as Stage, progress: 0 })), ...l]);

    // One after another, so slots are booked in the order the videos were added.
    for (const [i, { key, file }] of made.entries()) {
      try {
        const meta = await readVideo(file);
        update(key, { vertical: !!(meta.width && meta.height && meta.height > meta.width), thumb: meta.thumb ? URL.createObjectURL(meta.thumb) : undefined, stage: 'upload' });
        const res = await fetch('/api/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: titleFromFile(file.name), note: text, fileName: file.name, size: file.size, mime: file.type || 'video/mp4',
            duration: meta.duration, width: meta.width, height: meta.height, frames: meta.frames.length, slotAt: slots[i],
          }),
        });
        const links = await res.json();
        if (!res.ok) throw new Error(links.error ?? 'Could not start the upload.');
        const upload = put(links.video, file, file.type || 'video/mp4', (p) => update(key, { progress: p }));
        update(key, { id: links.id, abort: upload.abort });
        await upload.done;
        await Promise.all([
          ...meta.frames.map((f, n) => put(links.frames[n], f, 'image/jpeg').done),
          ...(links.thumb && meta.thumb ? [put(links.thumb, meta.thumb, 'image/jpeg').done] : []),
        ]);
        const fin = await fetch(`/api/videos/${links.id}/uploaded`, { method: 'POST' });
        if (!fin.ok) throw new Error((await fin.json().catch(() => ({}))).error ?? 'The upload could not be confirmed.');
        update(key, { stage: 'seo', progress: 1, abort: undefined });
        router.refresh();
      } catch (err) {
        update(key, { stage: 'failed', error: (err as Error).message, abort: undefined });
      }
    }
    setMode('next');
  }

  async function cancel(j: Job) {
    j.abort?.();
    if (j.id) await deleteVideo(j.id);
    setJobs((l) => l.filter((x) => x.key !== j.key));
    toast('Upload cancelled');
    router.refresh();
  }

  const ready = jobs.filter((j) => j.stage === 'booked').length;
  const uploading = jobs.some((j) => j.stage === 'read' || j.stage === 'upload');

  return (
    <>
      <header className="head">
        <h1>Add videos</h1>
        <Link className="btn" href="/">Done</Link>
      </header>

      <button
        className={`drop ${over ? 'over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]); }}
      >
        <span className="icon"><Icon name="upload" size={28} stroke={2.4} /></span>
        <b>Drop cartoons here, or choose files</b>
        <span className="small muted">mp4, mov or webm · any length · several at once</span>
      </button>
      <input ref={input} type="file" accept="video/*" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ''; }} />

      <section className="card" aria-labelledby="when">
        <h2 id="when" className="label">When should they go live?</h2>
        <div className="choices" role="radiogroup" aria-labelledby="when">
          <label className="choice"><input type="radio" name="mode" checked={mode === 'next'} onChange={() => setMode('next')} />
            Next free slots<small>{nextFree.length ? nextFree.slice(0, 2).map(formatSlot).join(', then ') : 'add a daily time in Settings'}</small></label>
          <label className="choice"><input type="radio" name="mode" checked={mode === 'tonight'} disabled={!tonight} onChange={() => setMode('tonight')} />
            Tonight<small>{tonight ? `${formatTime(tonight)} is free` : 'no free time left'}</small></label>
          <label className="choice"><input type="radio" name="mode" checked={mode === 'weekend'} disabled={!weekend.length} onChange={() => setMode('weekend')} />
            This weekend<small>{weekend.length ? `${weekend.length} free: ${formatSlot(weekend[0])}…` : 'no free slots'}</small></label>
          <label className="choice"><input type="radio" name="mode" checked={mode === 'pick'} onChange={() => { setMode('pick'); setPicked((p) => p ?? nextFree[0] ?? null); }} />
            Pick date and time<small>any quarter hour</small></label>
        </div>
        {mode === 'pick' && <SlotPicker value={picked} onChange={setPicked} taken={taken} now={now} idPrefix="add" />}
        {mode !== 'next' && <p className="small muted">Adding several videos? {mode === 'weekend' ? 'They fill the weekend slots in order; any extra take' : 'The first takes this time; the rest take'} the next free slots.</p>}
        <div className="field">
          <label htmlFor="note">What happens in it? <span className="muted" style={{ fontWeight: 400 }}>Optional, for one video. Helps Claude write a better title.</span></label>
          <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leo finds a magic lamp in the old bazaar" />
        </div>
      </section>

      {jobs.length > 0 && (
        <section aria-labelledby="prog" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 id="prog" className="label">{jobs.length} video{jobs.length > 1 ? 's' : ''} · {ready} ready</h2>
          {jobs.map((j) => {
            const at = ORDER.indexOf(j.stage);
            return (
              <article className="job" key={j.key}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {j.thumb ? <img className={`thumb${j.vertical ? ' vert' : ''}`} src={j.thumb} alt="" /> : <span className="thumb" aria-hidden="true" />}
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <b>{j.name} <span className="muted small" style={{ fontWeight: 400 }}>· {j.size >= 1024 ** 2 ? `${(j.size / 1024 ** 2).toFixed(0)} MB` : `${Math.max(1, Math.round(j.size / 1024))} KB`}</span></b>
                  {j.stage === 'failed' ? <span className="err" role="alert">{j.error}</span> : (
                    <ol className="steps" aria-label="Progress">
                      {STEPS.map((s, i) => {
                        const cls = i < at || j.stage === 'booked' ? 'done' : i === at ? `now${s.stage === 'seo' ? ' seo' : ''}` : '';
                        const label = i === at && s.stage === 'upload' ? `Uploading ${Math.round(j.progress * 100)}%` : i === at && s.stage === 'seo' ? 'Claude writing…' : i === at && s.stage === 'read' ? 'Reading…' : s.label;
                        return (
                          <li key={s.stage} className={cls}>
                            <span className="bar"><span style={i === at && s.stage === 'upload' ? { width: `${j.progress * 100}%` } : undefined} /></span>{label}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
                {j.stage === 'booked' && j.id ? (
                  <Link href={`/videos/${j.id}`} style={{ textAlign: 'right', textDecoration: 'none' }}><b className="mono" style={{ display: 'block', color: 'var(--ink)' }}>{formatSlot(j.slotAt)}</b><span style={{ fontWeight: 700 }}>Open</span></Link>
                ) : j.stage === 'read' || j.stage === 'upload' ? (
                  <button className="btn sm" onClick={() => void cancel(j)}>Cancel</button>
                ) : j.stage === 'seo' ? <span className="mono small muted">about 1 min</span> : (
                  <button className="btn sm" onClick={() => setJobs((l) => l.filter((x) => x.key !== j.key))}>Dismiss</button>
                )}
              </article>
            );
          })}
          <p className="small muted">{uploading ? 'Keep this page open until uploads reach 100%.' : 'You can leave this page: SEO and booking finish on the server.'}</p>
        </section>
      )}
    </>
  );
}
