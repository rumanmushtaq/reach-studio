import { NextResponse } from 'next/server';
import { getVideo } from '@/lib/repo';

// Polled by the Add videos page to move each video's progress steps.
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const video = await getVideo((await params).id);
  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  return NextResponse.json({ uploadState: video.uploadState, seoState: video.seoState, seoSource: video.seoSource, slotAt: video.slotAt });
}
