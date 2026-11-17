import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import * as repo from '@/lib/repo';
import { isOwner } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Where links in Supabase emails land: "confirm your email" and "reset your password".
// The link signs this browser in; then a confirmed owner gets their profile and goes on.

/** Only paths on this site: no other hosts, no backslash or control-character tricks. */
function safeNext(next: string | null, origin: string): string {
  if (!next || !next.startsWith('/') || /[\\\x00-\x1f]/.test(next)) return '/';
  const url = new URL(next, origin);
  return url.origin === origin ? `${url.pathname}${url.search}` : '/';
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get('next'), url.origin);
  const back = (reason: string) => NextResponse.redirect(new URL(`/login?reason=${reason}`, url.origin));

  // Supabase sends errors (e.g. an old link) as query parameters.
  const errorCode = url.searchParams.get('error_code');
  if (errorCode) return back(errorCode === 'otp_expired' ? 'link-expired' : 'link-failed');

  const supabase = await supabaseServer();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('no code') };
  // The code needs the cookie this browser got when it asked for the email. Supabase has already checked
  // the link itself, so a confirmation link opened in another browser still confirmed the email.
  if (error) {
    const otherBrowser = /code verifier|flow state/i.test(error.message) || error.message === 'no code';
    if (otherBrowser && url.searchParams.get('kind') === 'signup') return back('confirmed');
    return back(otherBrowser ? 'other-browser' : 'link-expired');
  }

  // Email verified: create or update the owner's profile.
  const { data } = await supabase.auth.getUser();
  if (data.user && isOwner({ app_metadata: data.user.app_metadata })) {
    const existing = await repo.getProfile(data.user.id);
    const name = (typeof data.user.user_metadata?.name === 'string' && data.user.user_metadata.name) || existing?.name || data.user.email || 'Owner';
    await repo.saveProfile({ id: data.user.id, name, email: data.user.email ?? '' }, Date.now(), true);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
