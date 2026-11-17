import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { codePending, isOwner, supabaseConfig } from './lib/supabase/config';

// Every page needs the signed-in studio owner (Supabase Auth), with their 2-step code when they turned it on.
// The job runner and the Claude helper check CRON_SECRET; signed local file links check their own signature.
const MACHINE = [/^\/api\/cron\//, /^\/api\/helper\//, /^\/api\/local-files\//];
const SIGN_IN = [/^\/login$/, /^\/auth\//];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (MACHINE.some((re) => re.test(pathname))) return NextResponse.next();

  const cfg = supabaseConfig();
  if (!cfg) return SIGN_IN.some((re) => re.test(pathname)) ? NextResponse.next() : toLogin(req, 'not-set-up');

  // Reads the session from cookies and refreshes it when needed (new cookies go on the response).
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const owner = isOwner(claims);
  // The 2-step flag is inside the signed token, so this needs no extra call to Supabase.
  const needsCode = owner && codePending(claims);

  if (SIGN_IN.some((re) => re.test(pathname))) {
    // Already fully signed in: the sign-in page has nothing to do.
    if (pathname === '/login' && owner && !needsCode) return keep(res, NextResponse.redirect(new URL('/', req.url)));
    return res;
  }
  // The reset-password page asks for the 2-step code itself.
  if (owner && (!needsCode || pathname === '/reset-password')) return res;

  if (pathname.startsWith('/api/')) return keep(res, NextResponse.json({ error: 'Sign in first' }, { status: 401 }));
  const hadSession = req.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  const reason = needsCode ? 'code' : error && hadSession ? 'auth-error' : hadSession && claims ? 'not-owner' : hadSession ? 'expired' : undefined;
  return keep(res, toLogin(req, reason));
}

function toLogin(req: NextRequest, reason?: string) {
  const url = new URL('/login', req.url);
  if (reason) url.searchParams.set('reason', reason);
  return NextResponse.redirect(url);
}

/** Copies refreshed session cookies onto a redirect or error response. */
function keep(from: NextResponse, to: NextResponse) {
  for (const c of from.cookies.getAll()) to.cookies.set(c);
  return to;
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };
