import { type NextRequest, NextResponse } from 'next/server';
import { isValidSession, SESSION_COOKIE } from './lib/session';

// Everything needs the owner's login, except the login page and Google sign-in, the job runner and the
// Claude helper (they check CRON_SECRET) and signed local file links (they check their own signature).
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/helper\//, /^\/api\/local-files\//];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };
