import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { tick } from '@/lib/services';

// Runs due jobs: SEO that never finished, uploads and posts, and next-day file cleanup.
// Called every 15 minutes by cron-job.org (or GitHub Actions) and daily by Vercel Cron.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = env.CRON_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? new URL(req.url).searchParams.get('key');
  if (!secret || given !== secret) return NextResponse.json({ error: 'Wrong or missing CRON_SECRET' }, { status: 401 });
  const report = await tick();
  return NextResponse.json({ ok: true, ...report });
}
