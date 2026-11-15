import 'server-only';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { sign } from './crypto';
import { env, has } from './env';

// Video files live in Cloudflare R2. The browser uploads with a presigned PUT, platforms download with
// a presigned GET. Without R2 settings (local dev) files go to ./data/files behind signed local links.

export const LOCAL_ROOT = path.resolve('data/files');

let client: S3Client | null = null;
function r2(): S3Client {
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  return client;
}

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

/** URL the browser PUTs the file to. */
export async function uploadUrl(key: string, contentType: string): Promise<string> {
  if (!has.r2()) return localUrl(key, 'PUT', 6 * 3600);
  return getSignedUrl(r2(), new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 6 * 3600 });
}

/** Time-limited public link: used by Instagram, Facebook and Upload-Post to fetch the video, and for thumbnails. */
export async function downloadUrl(key: string, expiresSec = 24 * 3600): Promise<string> {
  if (!has.r2()) return localUrl(key, 'GET', expiresSec);
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), { expiresIn: Math.min(expiresSec, 7 * 24 * 3600) });
}

export async function fileSize(key: string): Promise<number | null> {
  try {
    if (!has.r2()) return (await stat(localPath(key))).size;
    const head = await r2().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function openStream(key: string): Promise<Readable> {
  if (!has.r2()) return createReadStream(localPath(key));
  const res = await r2().send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  return res.Body as Readable;
}

export async function readBytes(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await openStream(key)) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Deletes everything under a prefix, e.g. `videos/<id>/`. */
export async function deletePrefix(prefix: string): Promise<void> {
  if (!has.r2()) {
    await rm(localPath(prefix.replace(/\/$/, '')), { recursive: true, force: true });
    return;
  }
  const listed = await r2().send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: prefix }));
  const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
  if (keys.length) await r2().send(new DeleteObjectsCommand({ Bucket: env.R2_BUCKET, Delete: { Objects: keys } }));
}

/** Deletes only the video file, keeping thumbnail and frames for the studio's history. */
export async function deleteKey(key: string): Promise<void> {
  if (!has.r2()) {
    await rm(localPath(key), { force: true });
    return;
  }
  await r2().send(new DeleteObjectsCommand({ Bucket: env.R2_BUCKET, Delete: { Objects: [{ Key: key }] } }));
}

export async function ensureLocalDir(key: string): Promise<void> {
  await mkdir(path.dirname(localPath(key)), { recursive: true });
}

/** Total bytes stored, for the Storage box. */
export async function storageUsed(): Promise<number> {
  if (has.r2()) {
    let total = 0;
    let token: string | undefined;
    do {
      const page = await r2().send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, ContinuationToken: token }));
      for (const o of page.Contents ?? []) total += o.Size ?? 0;
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return total;
  }
  return 0; // local dev: not tracked
}
