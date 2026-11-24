'use server';

import { revalidatePath } from 'next/cache';
import { startClaude } from '@/lib/claude-start';
import { encrypt } from '@/lib/crypto';
import { env } from '@/lib/env';
import {
  channelSchema, fieldErrors, tiktokSchema, timeSchema, videoInfoSchema,
  type ChannelForm, type FormResult, type TikTokForm, type TimeForm, type VideoInfoForm,
} from '@/lib/forms';
import * as repo from '@/lib/repo';
import { normaliseSeo, PLATFORMS, type Platform } from '@/lib/seo';
import { retryPost } from '@/lib/services';
import { canBook } from '@/lib/slots';
import { deletePrefix, deleteKey, downloadUrl, fileSize, uploadTarget } from '@/lib/storage';
import type { UploadTarget } from '@/lib/browser-video';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const ok = (message?: string): Result => ({ ok: true, message });
const fail = (error: string): Result => ({ ok: false, error });

function refresh() {
  revalidatePath('/', 'layout');
}

// ---------- settings ----------

export async function addTime(input: TimeForm): Promise<FormResult> {
  const parsed = timeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const hhmm = parsed.data.time;
  const { times } = await repo.getSettings();
  if (times.includes(hhmm)) return { ok: false, fields: { time: 'That time is already a daily slot.' } };
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

export async function saveChannel(input: ChannelForm): Promise<FormResult> {
  const parsed = channelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  await repo.saveSettings(parsed.data);
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

export async function saveVideoInfo(videoId: string, input: VideoInfoForm): Promise<FormResult> {
  const parsed = videoInfoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  await repo.updateVideo(videoId, parsed.data);
  refresh();
  return { ok: true };
}

export async function saveSeo(videoId: string, seo: unknown): Promise<Result> {
  const video = await repo.getVideo(videoId);
  if (!video) return fail('This video was removed.');
  // The owner's own text wins: a Claude rewrite still waiting for the helper is dropped.
  await repo.updateVideo(videoId, { seo: normaliseSeo(seo, video), claudeWantedAt: null, claudeClaimedAt: null });
  return ok();
}

/** What the TikTok helper extension needs to fill TikTok's upload page: the file and Claude's caption. */
export type TikTokJob = { name: string; fileName: string; videoUrl: string; caption: string };

export async function tiktokJob(videoId: string): Promise<{ ok: true; job: TikTokJob } | { ok: false; error: string }> {
  const video = await repo.getVideo(videoId);
  if (!video) return { ok: false, error: 'This video was removed.' };
  if (video.fileDeletedAt) return { ok: false, error: 'The video file was already cleaned up after posting.' };
  if (!video.seo) return { ok: false, error: 'The text is still being written. Try again in a moment.' };
  const { caption, hashtags } = video.seo.tiktok;
  return {
    ok: true,
    job: {
      name: video.name,
      fileName: video.fileName || `${video.name}.mp4`,
      videoUrl: await downloadUrl(video.fileKey, 3600),
      caption: [caption.trim(), hashtags.join(' ')].filter(Boolean).join('\n\n').slice(0, 2200),
    },
  };
}

export async function rewriteSeo(videoId: string): Promise<Result> {
  const video = await repo.getVideo(videoId);
  if (!video) return fail('This video was removed.');
  if (video.seoState !== 'ready') return fail('The basic draft is still being written. Try again in a moment.');
  if (video.claudeWantedAt) return fail('Already waiting for Claude.');
  if ((await repo.listPosts([videoId])).some((p) => p.state !== 'waiting' || p.externalId)) {
    return fail('This video is already uploaded, so its title and description there no longer change.');
  }
  await repo.updateVideo(videoId, { claudeWantedAt: Date.now(), claudeClaimedAt: null });
  const start = await startClaude();
  refresh();
  return ok(start === 'started' || start === 'recent'
    ? 'Sent to Claude on GitHub. About 3 minutes.'
    : 'Queued. Claude writes it on its next run, every 15 minutes or later.');
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

export async function thumbnailUploadUrl(videoId: string, mime: string): Promise<{ ok: true; target: UploadTarget; key: string } | { ok: false; error: string }> {
  if (!(await repo.getVideo(videoId))) return { ok: false, error: 'This video was removed.' };
  if (mime !== 'image/jpeg' && mime !== 'image/png') return { ok: false, error: 'Use a JPG or PNG image.' };
  const key = `videos/${videoId}/custom-thumb-${Date.now()}.${mime === 'image/png' ? 'png' : 'jpg'}`;
  return { ok: true, target: await uploadTarget(key), key };
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

export async function connectTikTok(input: TikTokForm): Promise<FormResult> {
  const parsed = tiktokSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const { apiKey, user } = parsed.data;
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
