import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { verify } from '@/lib/crypto';
import { has } from '@/lib/env';
import { ensureLocalDir, localPath } from '@/lib/storage';

// Local dev stand-in for Cloudinary links. Only active when Cloudinary is not configured.
export const dynamic = 'force-dynamic';

function check(req: Request, key: string, method: 'GET' | 'PUT'): boolean {
  if (has.cloudinary()) return false;
  const q = new URL(req.url).searchParams;
  const exp = Number(q.get('exp'));
  return q.get('m') === method && exp * 1000 > Date.now() && verify(`${method}:${key}:${exp}`, q.get('sig') ?? '');
}

type Ctx = { params: Promise<{ key: string[] }> };

export async function PUT(req: Request, { params }: Ctx) {
  const key = (await params).key.join('/');
  if (!check(req, key, 'PUT')) return NextResponse.json({ error: 'Link expired or invalid' }, { status: 403 });
  await ensureLocalDir(key);
  await writeFile(localPath(key), Buffer.from(await req.arrayBuffer()));
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: Request, { params }: Ctx) {
  const key = (await params).key.join('/');
  if (!check(req, key, 'GET')) return NextResponse.json({ error: 'Link expired or invalid' }, { status: 403 });
  const file = localPath(key);
  const info = await stat(file).catch(() => null);
  if (!info) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const type = key.endsWith('.jpg') ? 'image/jpeg' : 'video/mp4';
  return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: { 'Content-Type': type, 'Content-Length': String(info.size), 'Cache-Control': 'private, max-age=3600' },
  });
}
