import 'server-only';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

/** The Claude helper signs its calls with CRON_SECRET. Returns an error response when it does not. */
export function helperDenied(req: Request): NextResponse | null {
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!env.CRON_SECRET || given !== env.CRON_SECRET) return NextResponse.json({ error: 'Wrong or missing CRON_SECRET' }, { status: 401 });
  return null;
}
