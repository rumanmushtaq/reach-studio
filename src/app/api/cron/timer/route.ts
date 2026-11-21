import { NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/cron-auth';
import { dbTimerStatus, startDbTimer } from '@/lib/db-timer';

// The database timer that calls the job runner every 5 minutes (see db-timer.ts).
// GET shows how it is doing; POST starts it, or updates it after the address or CRON_SECRET changed.
export const dynamic = 'force-dynamic';

// Drizzle wraps database errors in "Failed query"; the reason is in the cause. Never echo the query: it holds the secret.
const why = (e: unknown) => ((e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message).split('\n')[0];

export async function GET(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: 'Wrong or missing CRON_SECRET' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await dbTimerStatus()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: why(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: 'Wrong or missing CRON_SECRET' }, { status: 401 });
  try {
    await startDbTimer(new URL(req.url).origin);
    return NextResponse.json({ ok: true, ...(await dbTimerStatus()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: why(e) }, { status: 500 });
  }
}
