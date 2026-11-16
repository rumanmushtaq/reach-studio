import { NextResponse } from 'next/server';
import { has } from '@/lib/env';
import { googleLoginUrl } from '@/lib/google-login';
import { newState } from '@/lib/oauth';

export async function GET(req: Request) {
  if (!has.google()) return NextResponse.redirect(new URL('/login?error=setup', req.url));
  return NextResponse.redirect(googleLoginUrl(await newState()));
}
