import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { googleLoginEmail, isOwner } from '@/lib/google-login';
import { checkState } from '@/lib/oauth';
import { createSession, SESSION_COOKIE } from '@/lib/session';

const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, env.APP_URL));

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get('error')) return back('cancelled');
  if (!(await checkState(q.get('state')))) return back('expired');
  let email: string;
  try {
    email = await googleLoginEmail(q.get('code') ?? '');
  } catch {
    return back('google');
  }
  if (!isOwner(email)) return back('not-owner');
  const { token, maxAge } = await createSession(email);
  const res = NextResponse.redirect(new URL('/', env.APP_URL));
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.APP_URL.startsWith('https'), maxAge, path: '/' });
  return res;
}
