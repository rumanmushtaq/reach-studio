import { NextResponse } from 'next/server';
import { has } from '@/lib/env';
import { backToAccounts, newState } from '@/lib/oauth';
import { googleAuthUrl } from '@/lib/publishers/youtube';

export async function GET() {
  if (!has.google()) return backToAccounts('Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (see README).', false);
  return NextResponse.redirect(googleAuthUrl(await newState()));
}
