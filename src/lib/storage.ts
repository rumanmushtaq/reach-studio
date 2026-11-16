import 'server-only';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { UploadTarget } from './browser-video';
import {
  CLOUDINARY_MAX_VIDEO, cloudinaryBytes, cloudinaryDelete, cloudinaryDeletePrefix, cloudinaryOpen, cloudinaryUploadTarget, cloudinaryUrl,
} from './cloudinary';
import { sign } from './crypto';
import { env, has } from './env';

// Video files live in Cloudinary (CLOUDINARY_URL). The browser uploads straight to Cloudinary and the
// platforms download from its public link. Without it (local dev) files go to ./data/files behind
// signed local links.

export const LOCAL_ROOT = path.resolve('data/files');

export function localPath(key: string): string {
  const full = path.resolve(LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error('Bad file key');
  return full;
}

function localUrl(key: string, method: 'GET' | 'PUT', expiresSec: number): string {
  const exp = Math.floor(Date.now() / 1000) + expiresSec;
  const sig = sign(`${method}:${key}:${exp}`);
  return `${env.APP_URL}/api/local-files/${key}?m=${method}&exp=${exp}&sig=${sig}`;
}

/** Biggest video the storage accepts, or null for no limit. */
export function maxVideoBytes(): number | null {
  return has.cloudinary() ? CLOUDINARY_MAX_VIDEO : null;
}

/** Free storage on Cloudinary's free plan (25 credits), for the Storage box. */
export function freeStorageBytes(): number {
  return 25 * 1024 ** 3;
}

/** Where the browser sends the file: a signed form POST for Cloudinary, or a signed local PUT. */
export async function uploadTarget(key: string): Promise<UploadTarget> {
  if (has.cloudinary()) return cloudinaryUploadTarget(key);
  return { url: localUrl(key, 'PUT', 6 * 3600) };
}

/** Time-limited public link: used by Instagram, Facebook and Upload-Post to fetch the video, and for thumbnails. */
export async function downloadUrl(key: string, expiresSec = 24 * 3600): Promise<string> {
  if (has.cloudinary()) return cloudinaryUrl(key);
  return localUrl(key, 'GET', expiresSec);
}

export async function fileSize(key: string): Promise<number | null> {
  try {
    if (has.cloudinary()) return await cloudinaryBytes(key);
    return (await stat(localPath(key))).size;
  } catch {
    return null;
  }
}

export async function openStream(key: string): Promise<Readable> {
  if (has.cloudinary()) return cloudinaryOpen(key);
  return createReadStream(localPath(key));
}

export async function readBytes(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await openStream(key)) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Deletes everything under a prefix, e.g. `videos/<id>/`. */
export async function deletePrefix(prefix: string): Promise<void> {
  if (has.cloudinary()) return cloudinaryDeletePrefix(prefix);
  await rm(localPath(prefix.replace(/\/$/, '')), { recursive: true, force: true });
}

/** Deletes only the video file, keeping thumbnail and frames for the studio's history. */
export async function deleteKey(key: string): Promise<void> {
  if (has.cloudinary()) return cloudinaryDelete(key);
  await rm(localPath(key), { force: true });
}

export async function ensureLocalDir(key: string): Promise<void> {
  await mkdir(path.dirname(localPath(key)), { recursive: true });
}

