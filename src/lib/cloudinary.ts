import 'server-only';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { UploadTarget } from './browser-video';
import { env } from './env';

// Cloudinary storage, used when CLOUDINARY_URL is set (free plan, no card needed).
// Studio keys look like `videos/<id>/video.mp4`; in Cloudinary the public id is the key without its
// extension, under the `video` or `image` resource type. The free plan takes videos up to 100 MB.

export const CLOUDINARY_MAX_VIDEO = 100 * 1024 ** 2;

type Config = { cloud: string; key: string; secret: string };

/** Reads `cloudinary://<api_key>:<api_secret>@<cloud_name>`, the "API environment variable" on the dashboard. */
export function parseCloudinaryUrl(value: string): Config | null {
  try {
    const u = new URL(value);
    if (u.protocol !== 'cloudinary:' || !u.username || !u.password || !u.hostname) return null;
    return { cloud: u.hostname, key: decodeURIComponent(u.username), secret: decodeURIComponent(u.password) };
  } catch {
    return null;
  }
}

function config(): Config {
  const c = parseCloudinaryUrl(env.CLOUDINARY_URL);
  if (!c) throw new Error('CLOUDINARY_URL is not set correctly');
  return c;
}

/** Cloudinary request signature: sorted `k=v` pairs joined with `&`, then the API secret, SHA-1. */
export function cloudinarySignature(params: Record<string, string | number>, secret: string): string {
  const text = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return createHash('sha1').update(text + secret).digest('hex');
}

export function assetOf(key: string): { publicId: string; type: 'video' | 'image'; ext: string } {
  const m = key.match(/^(.+)\.([a-z0-9]+)$/i);
  const ext = m ? m[2].toLowerCase() : '';
  return { publicId: m ? m[1] : key, ext, type: /^(mp4|mov|m4v|webm|mkv|avi)$/.test(ext) ? 'video' : 'image' };
}

const api = (path: string) => `https://api.cloudinary.com/v1_1/${config().cloud}${path}`;
const basic = () => `Basic ${Buffer.from(`${config().key}:${config().secret}`).toString('base64')}`;
const segments = (id: string) => id.split('/').map(encodeURIComponent).join('/');

/** A signed form the browser POSTs the file with. Cloudinary accepts a signature for one hour. */
export function cloudinaryUploadTarget(key: string): UploadTarget {
  const { cloud, key: apiKey, secret } = config();
  const a = assetOf(key);
  const params = { public_id: a.publicId, timestamp: Math.floor(Date.now() / 1000) };
  return {
    url: `https://api.cloudinary.com/v1_1/${cloud}/${a.type}/upload`,
    fields: { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: apiKey, signature: cloudinarySignature(params, secret) },
  };
}

/** Public delivery link. Videos leave out the extension so Cloudinary serves the original file as uploaded. */
export function cloudinaryUrl(key: string): string {
  const a = assetOf(key);
  return `https://res.cloudinary.com/${config().cloud}/${a.type}/upload/${segments(a.publicId)}${a.type === 'image' && a.ext ? `.${a.ext}` : ''}`;
}

export async function cloudinaryBytes(key: string): Promise<number | null> {
  const a = assetOf(key);
  const res = await fetch(api(`/resources/${a.type}/upload/${segments(a.publicId)}`), { headers: { Authorization: basic() }, cache: 'no-store' });
  if (!res.ok) return null;
  const body = (await res.json()) as { bytes?: number };
  return body.bytes ?? null;
}

export async function cloudinaryOpen(key: string): Promise<Readable> {
  const res = await fetch(cloudinaryUrl(key), { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`Could not read ${key} from Cloudinary (${res.status})`);
  return Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
}

export async function cloudinaryDelete(key: string): Promise<void> {
  const { key: apiKey, secret } = config();
  const a = assetOf(key);
  const params = { invalidate: 'true', public_id: a.publicId, timestamp: Math.floor(Date.now() / 1000) };
  const form = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: apiKey, signature: cloudinarySignature(params, secret) });
  const res = await fetch(api(`/${a.type}/destroy`), { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Cloudinary delete failed (${res.status})`);
}

/** Deletes every image and video whose public id starts with the prefix, e.g. `videos/<id>/`. */
export async function cloudinaryDeletePrefix(prefix: string): Promise<void> {
  for (const type of ['video', 'image'] as const) {
    const res = await fetch(api(`/resources/${type}/upload?prefix=${encodeURIComponent(prefix)}`), { method: 'DELETE', headers: { Authorization: basic() } });
    if (!res.ok) throw new Error(`Cloudinary delete failed (${res.status})`);
  }
}
