import { NextResponse } from 'next/server';
import { z } from 'zod';
import { newId } from '@/lib/crypto';
import { insertVideo, takenSlots } from '@/lib/repo';
import { defaultPlatforms } from '@/lib/seo';
import { canBook } from '@/lib/slots';
import { maxVideoBytes, uploadTarget } from '@/lib/storage';

// Step 1 of adding a video: the browser describes the file and gets upload links back.
// The file itself goes straight from the browser to storage, never through this function.
const Body = z.object({
  name: z.string().trim().min(1).max(200),
  note: z.string().trim().max(500).default(''),
  fileName: z.string().max(300),
  size: z.number().int().positive().max(20 * 1024 ** 3),
  mime: z.string().max(100),
  duration: z.number().positive().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  frames: z.number().int().min(0).max(4),
  // A time the owner picked. Null: the next free daily slot is booked after the SEO is written.
  slotAt: z.number().int().nullable().default(null),
});

const EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv' };

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Some video details are missing.' }, { status: 400 });
  const b = parsed.data;
  const max = maxVideoBytes();
  if (max && b.size > max) {
    return NextResponse.json({ error: `This file is ${Math.round(b.size / 1024 ** 2)} MB. Cloudinary's free plan takes videos up to ${max / 1024 ** 2} MB: export it smaller (e.g. 720p) and add it again.` }, { status: 413 });
  }
  if (b.slotAt !== null && !canBook(b.slotAt, await takenSlots(), Date.now())) {
    return NextResponse.json({ error: 'That time is taken or too soon. Pick another time.' }, { status: 409 });
  }
  const id = newId();
  const ext = EXT[b.mime] ?? b.fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'mp4';
  const fileKey = `videos/${id}/video.${ext}`;
  const frameKeys = Array.from({ length: b.frames }, (_, i) => `videos/${id}/frame-${i + 1}.jpg`);
  const thumbKey = b.frames ? `videos/${id}/thumb.jpg` : null;
  const shape = b.width && b.height && b.height > b.width ? 'vertical' : 'horizontal';

  // The chosen time is reserved now, so no other video can take it while this one uploads.
  try {
    await insertVideo({
      id, name: b.name, note: b.note, fileName: b.fileName, fileKey, fileSize: b.size, mime: b.mime || 'video/mp4',
      duration: b.duration, width: b.width, height: b.height, shape, thumbKey, customThumbKey: null, frameKeys,
      platforms: defaultPlatforms(shape, b.duration), uploadState: 'uploading',
      seo: null, seoSource: null, seoState: 'pending', seoNote: null, seoStartedAt: null, seoAt: null,
      slotAt: b.slotAt, fileDeletedAt: null, createdAt: Date.now(),
    });
  } catch {
    return NextResponse.json({ error: 'That time was just taken. Pick another time.' }, { status: 409 });
  }

  return NextResponse.json({
    id,
    video: await uploadTarget(fileKey, b.mime || 'video/mp4'),
    frames: await Promise.all(frameKeys.map((k) => uploadTarget(k, 'image/jpeg'))),
    thumb: thumbKey ? await uploadTarget(thumbKey, 'image/jpeg') : null,
  });
}
