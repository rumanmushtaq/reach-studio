import { NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/cron-auth';
import { tick } from '@/lib/services';

// Runs due jobs: SEO that never finished, uploads and posts, and next-day file cleanup.
// Called every 5 minutes by the Supabase database timer (api/cron/timer), and by GitHub Actions as a backup.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: 'Wrong or missing CRON_SECRET' }, { status: 401 });
  const report = await tick();
  return NextResponse.json({ ok: true, ...report });
}
