// Browser-only helpers for adding a video: read it (length, shape, frames for Claude, a thumbnail) and upload it.

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

/** Never rejects: a file the browser cannot decode still uploads, just without frames. */
export function readVideo(file: File): Promise<VideoMeta> {
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

/** PUT a file to a presigned link with progress. Returns the request so it can be cancelled. */
export function put(url: string, body: Blob, type: string, onProgress?: (p: number) => void): { done: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const done = new Promise<void>((resolve, reject) => {
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check your internet and try again.'));
    xhr.onabort = () => reject(new Error('Cancelled'));
    xhr.send(body);
  });
  return { done, abort: () => xhr.abort() };
}

export function titleFromFile(n: string) {
  return n.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) || 'New cartoon';
}
