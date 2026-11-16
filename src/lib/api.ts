// The browser's calls to the studio's API routes. Used through TanStack Query (useQuery / useMutation).
import type { UploadTarget } from './browser-video';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `The studio answered ${res.status}`);
  return body as T;
}

export type NewUpload = {
  name: string; note: string; fileName: string; size: number; mime: string;
  duration: number | null; width: number | null; height: number | null; frames: number; slotAt: number | null;
};
export type UploadLinks = { id: string; video: UploadTarget; frames: UploadTarget[]; thumb: UploadTarget | null };
export type VideoState = { uploadState: string; seoState: string; seoSource: string | null; slotAt: number | null };

export const api = {
  startUpload: (body: NewUpload) =>
    call<UploadLinks>('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  finishUpload: (id: string) => call<{ ok: true }>(`/api/videos/${id}/uploaded`, { method: 'POST' }),
  videoState: (id: string) => call<VideoState>(`/api/videos/${id}/state`, { cache: 'no-store' }),
};

export const keys = {
  videoState: (id: string) => ['video-state', id] as const,
};
