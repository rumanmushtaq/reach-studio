import { NextResponse } from 'next/server';
import { helperJobs } from '@/lib/services';
import { helperDenied } from '../auth';

// The Claude helper on the owner's laptop asks for videos to write SEO for (about once a minute).
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = helperDenied(req);
  if (denied) return denied;
  return NextResponse.json({ jobs: await helperJobs(Date.now()) });
}
