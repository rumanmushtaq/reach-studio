'use server';

import { after } from 'next/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { encrypt } from '@/lib/crypto';
import { env } from '@/lib/env';
import * as repo from '@/lib/repo';
import { normaliseSeo, PLATFORMS, type Links, type Platform } from '@/lib/seo';
import { retryPost, runSeo } from '@/lib/services';
import { createSession, SESSION_COOKIE } from '@/lib/session';
import { canBook, isValidTime } from '@/lib/slots';
import { deletePrefix, deleteKey, fileSize, uploadUrl } from '@/lib/storage';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const ok = (message?: string): Result => ({ ok: true, message });
const fail = (error: string): Result => ({ ok: false, error });

function refresh() {
  revalidatePath('/', 'layout');
}

// ---------- login ----------

export async function login(_prev: unknown, form: FormData): Promise<{ error?: string }> {
  const given = Buffer.from(String(form.get('password') ?? ''));
  const want = Buffer.from(env.STUDIO_PASSWORD);
  if (!env.STUDIO_PASSWORD || !env.STUDIO_SECRET) return { error: 'Set STUDIO_PASSWORD and STUDIO_SECRET first (see README).' };
  if (given.length !== want.length || !timingSafeEqual(given, want)) return { error: 'Wrong password.' };
  const { token, maxAge } = await createSession();
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.APP_URL.startsWith('https'), maxAge, path: '/' });
  redirect('/');
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}

// ---------- settings ----------

export async function addTime(hhmm: string): Promise<Result> {
  if (!isValidTime(hhmm)) return fail('Pick a time on the quarter hour, such as 7:00 PM or 7:15 PM.');
  const { times } = await repo.getSettings();
  if (times.includes(hhmm)) return fail('That time is already a daily slot.');
  await repo.saveSettings({ times: [...times, hhmm] });
  refresh();
  return ok('Daily time added');
}

export async function removeTime(hhmm: string): Promise<Result> {
  const { times } = await repo.getSettings();
  if (times.length < 2) return fail('Keep at least one daily time.');
  await repo.saveSettings({ times: times.filter((t) => t !== hhmm) });
  refresh();
  return ok('Daily time removed');
}

export async function saveChannel(input: { channel: string; niche: string; links: Links }): Promise<Result> {
  const clean = (s: string) => String(s ?? '').trim().slice(0, 300);
  await repo.saveSettings({
    channel: clean(input.channel),
    niche: clean(input.niche),
    links: Object.fromEntries(PLATFORMS.map((p) => [p, clean(input.links?.[p] ?? '')])) as Links,
  });
  refresh();
  return ok('Saved');
}

// ---------- videos ----------

async function liveCount(videoId: string): Promise<number> {
  return (await repo.listPosts([videoId])).filter((p) => p.state === 'live').length;
}

export async function moveSlot(videoId: string, slot: number): Promise<Result> {
  const video = await repo.getVideo(videoId);
  if (!video) return fail('This video was removed.');
  if (await liveCount(videoId)) return fail('This video is already live, so its slot cannot change.');
  if (!canBook(slot, await repo.takenSlots(), Date.now())) return fail('That slot is taken or too soon. Pick another free slot.');
  try {
    await repo.updateVideo(videoId, { slotAt: slot });
  } catch {
    return fail('That slot was just taken. Pick another free slot.');
  }
  await repo.resetPosts(videoId);
  refresh();
  return ok('Moved');
}

export async function setPlatforms(videoId: string, platforms: Record<Platform, boolean>): Promise<Result> {
  const clean = Object.fromEntries(PLATFORMS.map((p) => [p, !!platforms[p]])) as Record<Platform, boolean>;
  if (!PLATFORMS.some((p) => clean[p])) return fail('Keep at least one platform.');
  await repo.setPlatforms(videoId, clean);
  refresh();
  return ok();
}

export async function saveVideoInfo(videoId: string, info: { name: string; note: string }): Promise<Result> {
  const name = String(info.name ?? '').trim().slice(0, 200);
  if (!name) return fail('Give the video a name.');
  await repo.updateVideo(videoId, { name, note: String(info.note ?? '').trim().slice(0, 500) });
  refresh();
  return ok();
}

export async function saveSeo(videoId: string, seo: unknown): Promise<Result> {
  const video = await repo.getVideo(videoId);
  if (!video) return fail('This video was removed.');
  await repo.updateVideo(videoId, { seo: normaliseSeo(seo, video) });
  return ok();
}

export async function rewriteSeo(videoId: string): Promise<Result> {
  const video = await repo.getVideo(videoId);
  if (!video) return fail('This video was removed.');
  if (video.seoState === 'working') return fail('Claude is already writing this one.');
  await repo.updateVideo(videoId, { seoState: 'pending' });
  after(() => runSeo(videoId));
  refresh();
  return ok('Claude is writing…');
}

export async function deleteVideo(videoId: string): Promise<Result> {
  const posts = await repo.listPosts([videoId]);
  await deletePrefix(`videos/${videoId}/`);
  await repo.deleteVideoRow(videoId);
  refresh();
  const onPlatforms = posts.filter((p) => p.externalId && (p.state === 'scheduled' || p.state === 'live')).map((p) => p.platform);
  return ok(onPlatforms.length ? `Removed. It is already on ${onPlatforms.join(', ')}; delete it there too if you want it gone.` : 'Video removed');
}

// ---------- custom thumbnail ----------

export async function thumbnailUploadUrl(videoId: string, mime: string): Promise<{ ok: true; url: string; key: string } | { ok: false; error: string }> {
  if (!(await repo.getVideo(videoId))) return { ok: false, error: 'This video was removed.' };
  if (mime !== 'image/jpeg' && mime !== 'image/png') return { ok: false, error: 'Use a JPG or PNG image.' };
  const key = `videos/${videoId}/custom-thumb-${Date.now()}.${mime === 'image/png' ? 'png' : 'jpg'}`;
  return { ok: true, url: await uploadUrl(key, mime), key };
}

export async function setCustomThumb(videoId: string, key: string): Promise<Result> {
  const video = await repo.getVideo(videoId);
  if (!video || !key.startsWith(`videos/${videoId}/custom-thumb-`)) return fail('This video was removed.');
  const size = await fileSize(key);
  if (!size) return fail('The image did not upload. Try again.');
  if (size > 2 * 1024 * 1024) { await deleteKey(key); return fail('YouTube thumbnails must be under 2 MB.'); }
  if (video.customThumbKey) await deleteKey(video.customThumbKey).catch(() => undefined);
  await repo.updateVideo(videoId, { customThumbKey: key });
  // Already uploaded early to YouTube: run its step now so the thumbnail is set there too.
  const yt = (await repo.listPosts([videoId])).find((p) => p.platform === 'youtube' && p.state === 'scheduled');
  if (yt) await repo.updatePost(yt.id, { runAt: Date.now() });
  refresh();
  return ok('Thumbnail added');
}

export async function removeCustomThumb(videoId: string): Promise<Result> {
  const video = await repo.getVideo(videoId);
  if (video?.customThumbKey) {
    await deleteKey(video.customThumbKey).catch(() => undefined);
    await repo.updateVideo(videoId, { customThumbKey: null });
  }
  refresh();
  return ok('Thumbnail removed');
}

export async function retry(postId: string): Promise<Result> {
  await retryPost(postId);
  refresh();
  return ok('Queued. It runs on the next check, within 15 minutes.');
}

// ---------- accounts ----------

export async function connectTikTok(input: { apiKey: string; user: string }): Promise<Result> {
  const apiKey = String(input.apiKey ?? '').trim();
  const user = String(input.user ?? '').trim();
  if (!apiKey || !user) return fail('Enter your Upload-Post API key and profile name.');
  await repo.saveAccount({ platform: 'tiktok', externalId: user, name: `${user} (Upload-Post)`, tokens: encrypt(JSON.stringify({ apiKey, user })), connectedAt: Date.now() });
  refresh();
  return ok('TikTok connected');
}

export async function disconnect(platform: Platform): Promise<Result> {
  if (!PLATFORMS.includes(platform)) return fail('Unknown platform');
  await repo.deleteAccount(platform);
  refresh();
  return ok('Disconnected');
}
