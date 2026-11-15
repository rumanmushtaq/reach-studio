import { after, NextResponse } from 'next/server';
import { getVideo, resetPosts, updateVideo } from '@/lib/repo';
import { runSeo } from '@/lib/services';
import { fileSize } from '@/lib/storage';

// Step 2 of adding a video: the upload finished. SEO starts right away and books the slot when done.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await getVideo(id);
  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  const size = await fileSize(video.fileKey);
  if (!size) return NextResponse.json({ error: 'The upload did not reach storage. Try adding the video again.' }, { status: 409 });
  await updateVideo(id, { uploadState: 'ready', fileSize: size });
  // A time the owner picked is already booked: plan its posts now. They wait until the SEO is ready.
  if (video.slotAt) await resetPosts(id);
  // Runs after the response; if it is cut off, the job runner finishes it on its next tick.
  after(() => runSeo(id));
  return NextResponse.json({ ok: true });
}
