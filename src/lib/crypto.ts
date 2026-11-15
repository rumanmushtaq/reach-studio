import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env';

// Platform tokens are stored encrypted with AES-256-GCM, keyed from STUDIO_SECRET.

function key(): Buffer {
  if (!env.STUDIO_SECRET) throw new Error('STUDIO_SECRET is not set');
  return createHash('sha256').update(env.STUDIO_SECRET).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function sign(value: string): string {
  return createHmac('sha256', key()).update(value).digest('base64url');
}

export function verify(value: string, signature: string): boolean {
  const a = Buffer.from(sign(value));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newId(): string {
  return randomBytes(9).toString('base64url');
}
