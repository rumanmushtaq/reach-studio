'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { deleteVideo } from '@/app/actions';
import { api, keys } from '@/lib/api';
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

export function UploadView({ nextFree, tonight, weekend, taken, now, preset, maxBytes }: {
  nextFree: number[]; tonight: number | null; weekend: number[]; taken: Taken[]; now: number; preset: number | null; maxBytes: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  // The "when" choice, picked time and note are form values (react-hook-form); jobs are upload progress.
  const form = useForm<{ mode: Mode; picked: number | null; note: string }>({
    defaultValues: { mode: preset ? 'pick' : 'next', picked: preset ?? nextFree[0] ?? null, note: '' },
  });
  const mode = useWatch({ control: form.control, name: 'mode' });
  const [over, setOver] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const seq = useRef(0);

  const update = (key: number, patch: Partial<Job>) => setJobs((l) => l.map((j) => (j.key === key ? { ...j, ...patch } : j)));

  const startUpload = useMutation({ mutationFn: api.startUpload });
  const finishUpload = useMutation({ mutationFn: api.finishUpload });
  const removeVideo = useMutation({ mutationFn: deleteVideo });

  function slotsFor(count: number, mode: Mode, picked: number | null): (number | null)[] {
    if (mode === 'tonight') return [tonight, ...Array(count - 1).fill(null)];
    if (mode === 'pick') return [picked, ...Array(count - 1).fill(null)];
    if (mode === 'weekend') return Array.from({ length: count }, (_, i) => weekend[i] ?? null);
    return Array(count).fill(null);
  }

  async function add(files: File[]) {
    const all = files.filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name));
    if (!all.length) return toast('Choose a video file: mp4, mov or webm.');
    const vids = maxBytes ? all.filter((f) => f.size <= maxBytes) : all;
    if (vids.length < all.length) {
      const big = all.filter((f) => !vids.includes(f)).map((f) => f.name).join(', ');
      toast(`Over ${maxBytes! / 1024 ** 2} MB, so not added: ${big}. Export smaller (e.g. 720p) and add again.`);
      if (!vids.length) return;
    }
    const { mode, picked, note } = form.getValues();
    if (mode === 'pick') {
      const problem = slotProblem(picked, taken, Date.now());
      if (problem) return toast(problem);
    }
    const slots = slotsFor(vids.length, mode, picked);
    const text = vids.length === 1 ? note.trim().slice(0, 500) : '';
    form.setValue('note', '');
    const made = vids.map((f) => ({ key: ++seq.current, file: f }));
    setJobs((l) => [...made.map(({ key, file }) => ({ key, name: titleFromFile(file.name), size: file.size, vertical: false, stage: 'read' as Stage, progress: 0 })), ...l]);

    // One after another, so slots are booked in the order the videos were added.
    for (const [i, { key, file }] of made.entries()) {
      try {
        const meta = await readVideo(file);
        update(key, { vertical: !!(meta.width && meta.height && meta.height > meta.width), thumb: meta.thumb ? URL.createObjectURL(meta.thumb) : undefined, stage: 'upload' });
        const links = await startUpload.mutateAsync({
          name: titleFromFile(file.name), note: text, fileName: file.name, size: file.size, mime: file.type || 'video/mp4',
          duration: meta.duration, width: meta.width, height: meta.height, frames: meta.frames.length, slotAt: slots[i],
        });
        const upload = put(links.video, file, file.type || 'video/mp4', (p) => update(key, { progress: p }));
        update(key, { id: links.id, abort: upload.abort });
        await upload.done;
        await Promise.all([
          ...meta.frames.map((f, n) => put(links.frames[n], f, 'image/jpeg').done),
          ...(links.thumb && meta.thumb ? [put(links.thumb, meta.thumb, 'image/jpeg').done] : []),
        ]);
        await finishUpload.mutateAsync(links.id);
        update(key, { stage: 'seo', progress: 1, abort: undefined });
        router.refresh();
      } catch (err) {
        update(key, { stage: 'failed', error: (err as Error).message, abort: undefined });
      }
    }
    form.setValue('mode', 'next');
  }

  async function cancel(j: Job) {
    j.abort?.();
    if (j.id) await removeVideo.mutateAsync(j.id);
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
        <span className="small muted">mp4, mov or webm · {maxBytes ? `up to ${maxBytes / 1024 ** 2} MB each` : 'any size'} · several at once</span>
      </button>
      <input ref={input} type="file" accept="video/*" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ''; }} />

      <section className="card" aria-labelledby="when">
        <h2 id="when" className="label">When should they go live?</h2>
        <div className="choices" role="radiogroup" aria-labelledby="when">
          <label className="choice"><input type="radio" value="next" {...form.register('mode')} />
            Next free slots<small>{nextFree.length ? nextFree.slice(0, 2).map(formatSlot).join(', then ') : 'add a daily time in Settings'}</small></label>
          <label className="choice"><input type="radio" value="tonight" disabled={!tonight} {...form.register('mode')} />
            Tonight<small>{tonight ? `${formatTime(tonight)} is free` : 'no free time left'}</small></label>
          <label className="choice"><input type="radio" value="weekend" disabled={!weekend.length} {...form.register('mode')} />
            This weekend<small>{weekend.length ? `${weekend.length} free: ${formatSlot(weekend[0])}…` : 'no free slots'}</small></label>
          <label className="choice"><input type="radio" value="pick" {...form.register('mode', { onChange: () => { if (!form.getValues('picked')) form.setValue('picked', nextFree[0] ?? null); } })} />
            Pick date and time<small>any quarter hour</small></label>
        </div>
        {mode === 'pick' && <Controller control={form.control} name="picked" render={({ field }) => (
          <SlotPicker value={field.value} onChange={field.onChange} taken={taken} now={now} idPrefix="add" />
        )} />}
        {mode !== 'next' && <p className="small muted">Adding several videos? {mode === 'weekend' ? 'They fill the weekend slots in order; any extra take' : 'The first takes this time; the rest take'} the next free slots.</p>}
        <div className="field">
          <label htmlFor="note">What happens in it? <span className="muted" style={{ fontWeight: 400 }}>Optional, for one video. Helps Claude write a better title.</span></label>
          <input id="note" className="input" maxLength={500} {...form.register('note')} placeholder="Leo finds a magic lamp in the old bazaar" />
        </div>
      </section>

      {jobs.length > 0 && (
        <section aria-labelledby="prog" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 id="prog" className="label">{jobs.length} video{jobs.length > 1 ? 's' : ''} · {ready} ready</h2>
          {jobs.map((j) => (
            <JobCard key={j.key} job={j} onBooked={(slotAt) => update(j.key, { stage: 'booked', slotAt })}
              onCancel={() => void cancel(j)} onDismiss={() => setJobs((l) => l.filter((x) => x.key !== j.key))} />
          ))}
          <p className="small muted">{uploading ? 'Keep this page open until uploads reach 100%.' : 'You can leave this page: SEO and booking finish on the server.'}</p>
        </section>
      )}
    </>
  );
}

/** One added video and its steps. While Claude's draft and the booking finish, it polls the video's state. */
function JobCard({ job: j, onBooked, onCancel, onDismiss }: { job: Job; onBooked: (slotAt: number) => void; onCancel: () => void; onDismiss: () => void }) {
  const state = useQuery({
    queryKey: keys.videoState(j.id ?? ''),
    queryFn: () => api.videoState(j.id!),
    enabled: j.stage === 'seo' && !!j.id,
    refetchInterval: 3000,
    staleTime: 0,
  });
  const booked = state.data?.seoState === 'ready' && state.data.slotAt ? state.data.slotAt : null;
  useEffect(() => { if (booked && j.stage === 'seo') onBooked(booked); }, [booked, j.stage, onBooked]);

  const at = ORDER.indexOf(j.stage);
  return (
    <article className="job">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {j.thumb ? <img className={`thumb${j.vertical ? ' vert' : ''}`} src={j.thumb} alt="" /> : <span className="thumb" aria-hidden="true" />}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b>{j.name} <span className="muted small" style={{ fontWeight: 400 }}>· {j.size >= 1024 ** 2 ? `${(j.size / 1024 ** 2).toFixed(0)} MB` : `${Math.max(1, Math.round(j.size / 1024))} KB`}</span></b>
        {j.stage === 'failed' ? <span className="err" role="alert">{j.error}</span> : (
          <ol className="steps" aria-label="Progress">
            {STEPS.map((s, i) => {
              const cls = i < at || j.stage === 'booked' ? 'done' : i === at ? `now${s.stage === 'seo' ? ' seo' : ''}` : '';
              const label = i === at && s.stage === 'upload' ? `Uploading ${Math.round(j.progress * 100)}%` : i === at && s.stage === 'seo' ? 'Writing SEO…' : i === at && s.stage === 'read' ? 'Reading…' : s.label;
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
        <button className="btn sm" onClick={onCancel}>Cancel</button>
      ) : j.stage === 'seo' ? <span className="mono small muted">a few seconds</span> : (
        <button className="btn sm" onClick={onDismiss}>Dismiss</button>
      )}
    </article>
  );
}
