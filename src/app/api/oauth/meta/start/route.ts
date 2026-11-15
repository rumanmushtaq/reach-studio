import { NextResponse } from 'next/server';
import { has } from '@/lib/env';
import { backToAccounts, newState } from '@/lib/oauth';
import { metaAuthUrl } from '@/lib/publishers/meta';

export async function GET() {
  if (!has.meta()) return backToAccounts('Add META_APP_ID and META_APP_SECRET first (see README).', false);
  return NextResponse.redirect(metaAuthUrl(await newState()));
}
