'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useToast } from './ui';

// Adding a video: read it in the browser (length, shape, 4 frames for Claude, a thumbnail),
// ask the server for upload links, upload straight to storage, then tell the server it is done.

type Item = { name: string; progress: number; stage: string; error?: string };

type Meta = { duration: number | null; width: number | null; height: number | null; frames: Blob[]; thumb: Blob | null };

function seek(el: HTMLVideoElement, t: number) {
  return new Promise<void>((res, rej) => {
    const to = setTimeout(() => rej(new Error('seek')), 8000);
    el.onseeked = () => { clearTimeout(to); res(); };
    el.currentTime = Math.max(0.05, Math.min(t, (el.duration || t + 1) - 0.05));
  });
}

function grab(el: HTMLVideoElement, width: number, quality: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((width * el.videoHeight) / el.videoWidth);
  c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height);
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('frame'))), 'image/jpeg', quality));
}

function readVideo(file: File): Promise<Meta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.muted = true; el.preload = 'auto'; el.playsInline = true;
    const empty: Meta = { duration: null, width: null, height: null, frames: [], thumb: null };
    const done = (m: Meta) => { clearTimeout(timer); URL.revokeObjectURL(url); el.removeAttribute('src'); el.load(); resolve(m); };
    const timer = setTimeout(() => done(empty), 30000);
    el.onerror = () => done(empty);
    el.onloadeddata = async () => {
      const w = el.videoWidth, h = el.videoHeight;
      const d = isFinite(el.duration) && el.duration > 0 ? el.duration : null;
      try {
        const frames: Blob[] = [];
        for (let i = 1; i <= 4; i++) { await seek(el, ((d ?? 1) * i) / 5); frames.push(await grab(el, 640, 0.75)); }
        await seek(el, (d ?? 1) * 0.4);
        done({ duration: d, width: w || null, height: h || null, frames, thumb: await grab(el, 320, 0.75) });
      } catch {
        done({ ...empty, duration: d, width: w || null, height: h || null });
      }
    };
    el.src = url;
  });
}

function put(url: string, body: Blob, type: string, onProgress?: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check your internet and try again.'));
    xhr.send(body);
  });
}

function titleFromFile(n: string) {
  return n.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) || 'New cartoon';
}

export function AddVideo({ nextFree }: { nextFree: string }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [over, setOver] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  const update = (i: number, patch: Partial<Item>) => setItems((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function add(files: File[]) {
    const vids = files.filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name));
    if (!vids.length) return toast('Choose a video file (mp4, mov or webm).');
    const text = vids.length === 1 ? note.trim() : '';
    setNote('');
    const base = items.length;
    setItems((list) => [...list, ...vids.map((f) => ({ name: titleFromFile(f.name), progress: 0, stage: 'Waiting…' }))]);
    // One after another, so slots are booked in the order the videos were added.
    for (const [k, file] of vids.entries()) {
      const i = base + k;
      try {
        update(i, { stage: 'Reading video…' });
        const meta = await readVideo(file);
        const res = await fetch('/api/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: titleFromFile(file.name), note: text, fileName: file.name, size: file.size, mime: file.type || 'video/mp4',
            duration: meta.duration, width: meta.width, height: meta.height, frames: meta.frames.length,
          }),
        });
        const links = await res.json();
        if (!res.ok) throw new Error(links.error ?? 'Could not start the upload.');
        router.refresh();
        update(i, { stage: 'Uploading…' });
        await put(links.video, file, file.type || 'video/mp4', (p) => update(i, { progress: p }));
        await Promise.all([
          ...meta.frames.map((f, n) => put(links.frames[n], f, 'image/jpeg')),
          ...(links.thumb && meta.thumb ? [put(links.thumb, meta.thumb, 'image/jpeg')] : []),
        ]);
        const fin = await fetch(`/api/videos/${links.id}/uploaded`, { method: 'POST' });
        if (!fin.ok) throw new Error((await fin.json().catch(() => ({}))).error ?? 'Upload could not be confirmed.');
        update(i, { stage: 'Uploaded. Claude is writing the SEO…', progress: 1 });
        router.refresh();
      } catch (err) {
        update(i, { stage: 'Failed', error: (err as Error).message });
      }
    }
    toast(vids.length > 1 ? `${vids.length} videos added` : 'Video added');
  }

  const active = items.filter((x) => !(x.progress === 1 && !x.error));
  return (
    <div className="card" id="addcard">
      <div className="section-h"><h2>Add a new video</h2><span className="small muted">mp4, mov or webm · several at once is fine</span></div>
      <div className="field">
        <label htmlFor="addnote">What happens in it? (optional, helps Claude)</label>
        <input className="input" id="addnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leo finds a magic lamp in the old bazaar" />
      </div>
      <div
        className={`drop ${over ? 'over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]); }}
      >
        <b>Drop your cartoon here</b>
        <span className="muted small">or click to choose a file. It takes the next free slot: {nextFree}.</span>
      </div>
      <input ref={input} type="file" accept="video/*" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {active.length > 0 && (
        <div className="list">
          {active.map((x, i) => (
            <div key={i} className="field">
              <span className="small"><b>{x.name}</b> · {x.error ? <span className="err">{x.error}</span> : x.stage}</span>
              {!x.error && <div className="progress"><span style={{ width: `${Math.round(x.progress * 100)}%` }} /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
