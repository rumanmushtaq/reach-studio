// Browser-only helpers for adding a video: read it (length, shape, frames for Claude, a thumbnail) and upload it.

/** Where a file is uploaded: a presigned PUT link, or a form POST (Cloudinary) when `fields` is set. */
export type UploadTarget = { url: string; fields?: Record<string, string> };

export type VideoMeta = { duration: number | null; width: number | null; height: number | null; frames: Blob[]; thumb: Blob | null };

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

/** What reading a video is doing now, for the progress line: a short text and how far (0 to 1). */
export type ReadStep = { text: string; progress: number };

/** Never rejects: a file the browser cannot decode still uploads, just without frames. */
export function readVideo(file: File, onStep?: (s: ReadStep) => void): Promise<VideoMeta> {
  onStep?.({ text: 'Opening the file', progress: 0.05 });
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.muted = true; el.preload = 'auto'; el.playsInline = true;
    const empty: VideoMeta = { duration: null, width: null, height: null, frames: [], thumb: null };
    const done = (m: VideoMeta) => { clearTimeout(timer); URL.revokeObjectURL(url); el.removeAttribute('src'); el.load(); resolve(m); };
    const timer = setTimeout(() => done(empty), 30000);
    el.onerror = () => done(empty);
    el.onloadeddata = async () => {
      const w = el.videoWidth, h = el.videoHeight;
      const d = isFinite(el.duration) && el.duration > 0 ? el.duration : null;
      const len = d ? `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}` : 'unknown length';
      onStep?.({ text: `Found ${len} · ${w && h ? `${w}×${h}${h > w ? ', vertical' : ''}` : 'size unknown'}`, progress: 0.2 });
      try {
        const frames: Blob[] = [];
        for (let i = 1; i <= 4; i++) {
          onStep?.({ text: `Taking frame ${i} of 4 for Claude`, progress: 0.2 + i * 0.17 });
          await seek(el, ((d ?? 1) * i) / 5);
          frames.push(await grab(el, 640, 0.75));
        }
        onStep?.({ text: 'Making the thumbnail', progress: 0.95 });
        await seek(el, (d ?? 1) * 0.4);
        done({ duration: d, width: w || null, height: h || null, frames, thumb: await grab(el, 320, 0.75) });
      } catch {
        done({ ...empty, duration: d, width: w || null, height: h || null });
      }
    };
    el.src = url;
  });
}

/** Uploads a file with progress. Returns the request so it can be cancelled. */
export function put(target: UploadTarget, body: Blob, type: string, onProgress?: (p: number) => void): { done: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const done = new Promise<void>((resolve, reject) => {
    let payload: Blob | FormData = body;
    if (target.fields) {
      const form = new FormData();
      for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
      form.append('file', body);
      payload = form;
      xhr.open('POST', target.url);
    } else {
      xhr.open('PUT', target.url);
      xhr.setRequestHeader('Content-Type', type);
    }
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status < 300) return resolve();
      // Cloudinary explains refusals, e.g. a file over the plan's size limit.
      const why = (() => { try { return JSON.parse(xhr.responseText)?.error?.message as string | undefined; } catch { return undefined; } })();
      reject(new Error(why ? `Upload failed: ${why}` : `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your internet and try again.'));
    xhr.onabort = () => reject(new Error('Cancelled'));
    xhr.send(payload);
  });
  return { done, abort: () => xhr.abort() };
}

export function titleFromFile(n: string) {
  return n.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) || 'New cartoon';
}
