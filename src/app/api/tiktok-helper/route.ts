import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { zip } from '@/lib/zip';

// Download of the posting helper extension (extensions/tiktok-helper) as a zip, for Settings → TikTok helper.
// Only the files Chrome needs; the test stays out. next.config.ts ships the folder with this route.
const FILES = ['manifest.json', 'background.js', 'studio.js', 'fill.js', 'site.js'];

export async function GET() {
  const dir = path.join(process.cwd(), 'extensions', 'tiktok-helper');
  const files = await Promise.all(FILES.map(async (f) => ({ path: `reach-tiktok-helper/${f}`, data: await readFile(path.join(dir, f)) })));
  return new Response(new Uint8Array(zip(files)), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="reach-tiktok-helper.zip"',
      'Cache-Control': 'no-store',
    },
  });
}
