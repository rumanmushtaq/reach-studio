import 'server-only';
import { seoPrompt } from './claude';
import { startClaude } from './claude-start';
import { decrypt, encrypt } from './crypto';
import type { PostRow, VideoRow } from './db/schema';
import { MAX_ATTEMPTS, retryAt, shouldDeleteFile } from './plan';
import { createFacebookPublisher, createInstagramPublisher } from './publishers/meta';
import { createTikTokPublisher } from './publishers/tiktok';
import { AuthError, PublishError, type Publisher, type StepResult } from './publishers/types';
import { createYouTubePublisher } from './publishers/youtube';
import * as repo from './repo';
import { draftSeo, normaliseSeo, ResearchSchema, type Platform } from './seo';
import { deleteKey, downloadUrl, openStream } from './storage';

// ---------- SEO ----------

/**
 * Writes a basic SEO draft right away and books the next free slot if the video has none, so the video
 * never waits. Then it asks the Claude helper on the laptop to replace the draft (see helperJobs).
 */
export async function runSeo(videoId: string): Promise<void> {
  if (!(await repo.claimSeo(videoId, Date.now()))) return;
  const video = await repo.getVideo(videoId);
  if (!video) return;
  const brief = { name: video.name, note: video.note, shape: video.shape };
  await repo.saveSeo(videoId, video.seo ?? draftSeo(brief), video.seo ? (video.seoSource ?? 'draft') : 'draft', null);
  await repo.updateVideo(videoId, { claudeWantedAt: Date.now(), claudeClaimedAt: null });
  const fresh = await repo.getVideo(videoId);
  if (fresh && !fresh.slotAt) await repo.bookSlot(videoId);
  await startClaude();
}

/** True once any platform has the video: from then on the SEO there no longer changes. */
async function postingStarted(videoId: string): Promise<boolean> {
  return (await repo.listPosts([videoId])).some((p) => p.state !== 'waiting' || p.externalId);
}

const TOO_LATE = 'Posting started before Claude wrote it, so the basic draft was used.';

/** Jobs for the Claude helper: the request text and links to the frames. */
export async function helperJobs(now: number): Promise<{ id: string; name: string; prompt: string; frames: string[] }[]> {
  await repo.helperSeen(now);
  const settings = await repo.getSettings();
  // Drop rewrites that came too late first, so they never take the helper's turn.
  for (const v of await repo.listVideos()) {
    if (v.claudeWantedAt && await postingStarted(v.id)) await repo.finishClaudeJob(v.id, { seoNote: TOO_LATE });
  }
  const jobs = [];
  for (const v of await repo.claimClaudeJobs(now, 2)) {
    const frames = await Promise.all(v.frameKeys.map((k) => downloadUrl(k, 3600)));
    jobs.push({
      id: v.id, name: v.name, frames,
      prompt: seoPrompt({ name: v.name, note: v.note, shape: v.shape, durationSec: v.duration, channel: settings.channel, niche: settings.niche, frames: frames.length }),
    });
  }
  return jobs;
}

/** The helper's answer: Claude's SEO, or why it could not write it. */
export async function helperResult(videoId: string, answer: { seo?: unknown; error?: string }): Promise<'saved' | 'skipped'> {
  const video = await repo.getVideo(videoId);
  if (!video || !video.claudeClaimedAt) return 'skipped';
  if (await postingStarted(videoId)) { await repo.finishClaudeJob(videoId, { seoNote: TOO_LATE }); return 'skipped'; }
  if (answer.seo === undefined) {
    await repo.finishClaudeJob(videoId, { seoNote: `Claude could not write it (${(answer.error ?? 'no answer').slice(0, 200)}). The basic draft is used; press Write with Claude to try again.` });
    return 'skipped';
  }
  const seo = normaliseSeo(answer.seo, { name: video.name, note: video.note, shape: video.shape });
  const raw = (answer.seo as { research?: unknown } | null)?.research;
  const research = raw && typeof raw === 'object' ? ResearchSchema.parse(raw) : null;
  await repo.finishClaudeJob(videoId, { seo, research, seoSource: 'claude', seoNote: null, seoAt: Date.now() });
  return 'saved';
}

// ---------- posting ----------

const publishers: Record<Platform, Publisher> = {
  youtube: createYouTubePublisher(),
  facebook: createFacebookPublisher(),
  instagram: createInstagramPublisher(),
  tiktok: createTikTokPublisher(),
};

/** One step of one post. Never throws: every outcome is written to the post row. */
export async function runPost(post: PostRow, now: number): Promise<void> {
  const fail = (message: string, keepExternal = true) =>
    repo.updatePost(post.id, { state: 'failed', lastError: message, lockedUntil: null, ...(keepExternal ? {} : { externalId: null }) });

  const video = await repo.getVideo(post.videoId);
  if (!video || !video.slotAt) return void (await fail('The video is missing its slot.'));
  // A picked time is booked before the upload and SEO finish: wait for them instead of failing.
  if (video.uploadState !== 'ready' || video.seoState !== 'ready' || !video.seo) {
    return void (await repo.updatePost(post.id, { runAt: now + 5 * 60_000, lockedUntil: null }));
  }
  if (video.fileDeletedAt && post.state === 'waiting') return void (await fail('The video file was already deleted.'));
  const account = await repo.getAccount(post.platform);
  // Disconnected after the run picked the post: wait for it to be connected again instead of failing.
  if (!account) return void (await repo.updatePost(post.id, { lockedUntil: null }));

  const settings = await repo.getSettings();
  let result: StepResult;
  try {
    result = await publishers[post.platform].step(
      {
        video: video as VideoRow & { slotAt: number; seo: NonNullable<VideoRow['seo']> },
        post, links: settings.links, now,
        fileUrl: () => downloadUrl(video.fileKey, 24 * 3600),
        openFile: () => openStream(video.fileKey),
        openThumb: video.customThumbKey ? () => openStream(video.customThumbKey!) : null,
      },
      {
        externalId: account.externalId,
        tokens: JSON.parse(decrypt(account.tokens)),
        saveTokens: (t) => repo.updateAccountTokens(post.platform, encrypt(JSON.stringify(t))),
      },
    );
  } catch (err) {
    console.error(`Post ${post.platform} failed for`, post.videoId, err);
    if (err instanceof AuthError) return void (await fail(err.message));
    const retryable = err instanceof PublishError ? err.retryable : true;
    const message = err instanceof Error ? err.message : 'Unknown error';
    const attempts = post.attempts + 1;
    if (retryable && attempts < MAX_ATTEMPTS) {
      await repo.updatePost(post.id, { attempts, lastError: message, runAt: retryAt(attempts, now), lockedUntil: null });
    } else {
      // An Instagram container that failed processing cannot be reused.
      await fail(message, post.platform !== 'instagram');
    }
    return;
  }

  if (result.state === 'wait') {
    await repo.updatePost(post.id, { runAt: result.runAt, lockedUntil: null });
  } else if (result.state === 'live') {
    await repo.updatePost(post.id, {
      state: 'live', url: result.url ?? post.url, externalId: result.externalId ?? post.externalId,
      lastError: null, lockedUntil: null, runAt: now,
    });
  } else {
    await repo.updatePost(post.id, {
      state: result.state, runAt: result.runAt, externalId: result.externalId, url: result.url ?? post.url,
      attempts: 0, lastError: null, lockedUntil: null,
    });
  }
}

/** Puts a failed post back in the queue to run now. */
export async function retryPost(postId: string): Promise<void> {
  const post = await repo.getPost(postId);
  if (!post || post.state !== 'failed') return;
  const resume = post.externalId ? (post.platform === 'instagram' ? 'staged' : 'scheduled') : 'waiting';
  await repo.updatePost(post.id, { state: resume, runAt: Date.now(), attempts: 0, lastError: null, lockedUntil: null });
}

// ---------- cleanup ----------

/** Next-day cleanup: deletes video files that are live everywhere. Thumbnails, frames and history stay. */
export async function cleanupFiles(now: number): Promise<number> {
  const all = await repo.listVideos();
  const posts = await repo.listPosts();
  let deleted = 0;
  for (const v of all) {
    if (!shouldDeleteFile(v, posts.filter((p) => p.videoId === v.id), now)) continue;
    await deleteKey(v.fileKey);
    await repo.updateVideo(v.id, { fileDeletedAt: now });
    deleted++;
  }
  return deleted;
}

// ---------- job runner ----------

export type TickReport = { seo: number; posts: number; cleaned: number; stoppedEarly: boolean };

/** Runs everything that is due. Stops starting new work once `budgetMs` is used, leaving the rest for the next tick. */
export async function tick(budgetMs = 240_000): Promise<TickReport> {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);
  const report: TickReport = { seo: 0, posts: 0, cleaned: 0, stoppedEarly: false };

  for (const v of await repo.staleSeoVideos(started)) {
    if (left() < 120_000) { report.stoppedEarly = true; break; }
    await runSeo(v.id);
    report.seo++;
  }
  // A start that failed earlier gets another try. A job taken in the last 15 minutes is still being written.
  const now = Date.now();
  if ((await repo.listVideos()).some((v) => v.claudeWantedAt && (!v.claudeClaimedAt || v.claudeClaimedAt < now - 15 * 60_000))) await startClaude(now);

  for (const post of await repo.duePosts(Date.now())) {
    if (left() < 60_000) { report.stoppedEarly = true; break; }
    if (!(await repo.claimPost(post.id, Date.now(), 10 * 60_000))) continue;
    await runPost(post, Date.now());
    report.posts++;
  }

  report.cleaned = await cleanupFiles(Date.now());
  return report;
}
