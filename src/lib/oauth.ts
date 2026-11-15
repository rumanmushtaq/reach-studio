import 'server-only';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { env } from './env';

// CSRF guard for the Google and Meta sign-in round trips.
const STATE_COOKIE = 'rs_oauth_state';

export async function newState(): Promise<string> {
  const state = randomBytes(16).toString('base64url');
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: env.APP_URL.startsWith('https'), maxAge: 600, path: '/' });
  return state;
}

export async function checkState(given: string | null): Promise<boolean> {
  const jar = await cookies();
  const want = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  return !!want && want === given;
}

/** Back to the Accounts page with a message for the banner. */
export function backToAccounts(message: string, ok: boolean): NextResponse {
  const url = new URL('/accounts', env.APP_URL);
  url.searchParams.set(ok ? 'ok' : 'error', message);
  return NextResponse.redirect(url);
}
