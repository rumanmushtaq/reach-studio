import { createHmac } from 'node:crypto';
import { expect } from '@playwright/test';

// Helpers for the local Supabase Auth: read its emails from Mailpit, and make 2-step codes.

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:54324';

type Summary = { ID: string; Created: string };

/** How many emails this address has got so far. */
export async function mailCount(to: string): Promise<number> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  return ((await res.json()) as { messages: Summary[] }).messages.length;
}

/** The link in the newest email to `to`, waiting until there are more than `after` emails. */
export async function newestLink(to: string, after: number): Promise<string> {
  let messages: Summary[] = [];
  await expect.poll(async () => {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    messages = ((await res.json()) as { messages: Summary[] }).messages;
    return messages.length;
  }, { timeout: 30_000 }).toBeGreaterThan(after);
  const newest = messages.sort((a, b) => b.Created.localeCompare(a.Created))[0];
  const body = (await (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`)).json()) as { Text: string };
  const link = body.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\?\S+/)?.[0];
  if (!link) throw new Error(`No link in email: ${body.Text.slice(0, 300)}`);
  return link.replace(/[)\]>]+$/, '');
}

/** The current 6-digit code for a base32 TOTP secret, like an authenticator app shows. */
export function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
