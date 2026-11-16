import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { helperResult } from '@/lib/services';
import { helperDenied } from '../../auth';

// The Claude helper sends back Claude's SEO for one video, or why Claude could not write it.
const Body = z.object({ seo: z.unknown().optional(), error: z.string().max(2000).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = helperDenied(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Send { seo } or { error }' }, { status: 400 });
  const result = await helperResult((await params).id, parsed.data);
  revalidatePath('/', 'layout');
  return NextResponse.json({ result });
}
