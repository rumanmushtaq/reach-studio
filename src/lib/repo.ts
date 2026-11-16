import 'server-only';
import { and, asc, eq, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { newId } from './crypto';
import { db, schema } from './db';
import type { PostRow, SettingsRow, UserRow, VideoRow } from './db/schema';
import { firstRunAt, postsToReset } from './plan';
import type { Platform, Seo } from './seo';
import { canBook, freeSlots, normaliseTimes } from './slots';

const { settings, videos, posts, accounts, users } = schema;

const DEFAULT_SETTINGS: SettingsRow = {
  id: 1, times: ['19:00'], channel: '', niche: 'Kids cartoons in Urdu and English',
  links: { youtube: '', instagram: '', facebook: '', tiktok: '' }, helperSeenAt: null,
};

export async function getSettings(): Promise<SettingsRow> {
  const d = await db();
  const row = (await d.select().from(settings).where(eq(settings.id, 1)))[0];
  if (row) return row;
  await d.insert(settings).values(DEFAULT_SETTINGS).onConflictDoNothing();
  return DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Omit<SettingsRow, 'id'>>): Promise<void> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  next.times = normaliseTimes(next.times);
  if (!next.times.length) next.times = current.times;
  const d = await db();
  await d.update(settings).set({ times: next.times, channel: next.channel, niche: next.niche, links: next.links }).where(eq(settings.id, 1));
}

export async function listVideos(): Promise<VideoRow[]> {
  return (await db()).select().from(videos).orderBy(asc(videos.createdAt));
}

export async function getVideo(id: string): Promise<VideoRow | undefined> {
  return (await (await db()).select().from(videos).where(eq(videos.id, id)))[0];
}

export async function listPosts(videoIds?: string[]): Promise<PostRow[]> {
  const d = await db();
  if (videoIds && !videoIds.length) return [];
  return videoIds ? d.select().from(posts).where(inArray(posts.videoId, videoIds)) : d.select().from(posts);
}

export async function insertVideo(row: VideoRow): Promise<void> {
  await (await db()).insert(videos).values(row);
}

export async function updateVideo(id: string, patch: Partial<VideoRow>): Promise<void> {
  await (await db()).update(videos).set(patch).where(eq(videos.id, id));
}

export async function deleteVideoRow(id: string): Promise<void> {
  await (await db()).delete(videos).where(eq(videos.id, id));
}

export async function takenSlots(): Promise<number[]> {
  const rows = await (await db()).select({ slotAt: videos.slotAt }).from(videos);
  return rows.map((r) => r.slotAt).filter((s): s is number => s !== null);
}

/**
 * Books a slot for the video: the given one if still free, else the next free one.
 * The unique index on slot_at settles races between two videos finishing at once.
 */
export async function bookSlot(videoId: string, wanted?: number): Promise<number> {
  const { times } = await getSettings();
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = Date.now();
    const taken = await takenSlots();
    const slot = wanted !== undefined && attempt === 0 && canBook(wanted, taken, now)
      ? wanted
      : freeSlots({ times, taken, now, count: 1 })[0];
    if (slot === undefined) throw new Error('No free slot. Add a daily posting time in Settings.');
    try {
      await updateVideo(videoId, { slotAt: slot });
      await resetPosts(videoId);
      return slot;
    } catch (err) {
      if (!String(err).includes('videos_slot_at') && !String(err).includes('unique')) throw err;
    }
  }
  throw new Error('Could not book a slot. Try again.');
}

/** Makes one post row per chosen platform, timed from the slot. Live posts stay as they are. */
export async function resetPosts(videoId: string): Promise<void> {
  const video = await getVideo(videoId);
  if (!video?.slotAt) return;
  const d = await db();
  const existing = await listPosts([videoId]);
  const { create, remove } = postsToReset(video.platforms, existing);
  if (remove.length) {
    await d.delete(posts).where(and(eq(posts.videoId, videoId), inArray(posts.platform, remove), ne(posts.state, 'live')));
  }
  const now = Date.now();
  for (const platform of create) {
    const old = existing.find((p) => p.platform === platform);
    // A post already uploaded early keeps its platform id; the job runs now to move the time on the platform.
    const keepScheduled = old?.state === 'scheduled' && old.externalId;
    const values = {
      state: keepScheduled ? ('scheduled' as const) : ('waiting' as const),
      runAt: keepScheduled ? now : firstRunAt(platform, video.slotAt, now),
      attempts: 0, lastError: null, lockedUntil: null,
      externalId: keepScheduled ? old!.externalId : null,
      url: keepScheduled ? old!.url : null,
      updatedAt: now,
    };
    if (old) await d.update(posts).set(values).where(eq(posts.id, old.id));
    else await d.insert(posts).values({ id: newId(), videoId, platform, ...values });
  }
}

/** Posts whose time has come and that no other run holds. */
export async function duePosts(now: number): Promise<PostRow[]> {
  return (await db()).select().from(posts)
    .where(and(
      inArray(posts.state, ['waiting', 'staged', 'scheduled']),
      lte(posts.runAt, now),
      or(isNull(posts.lockedUntil), lt(posts.lockedUntil, now)),
    ))
    .orderBy(asc(posts.runAt));
}

/** Claims a post for this run. False when another run took it first. */
export async function claimPost(id: string, now: number, holdMs: number): Promise<boolean> {
  const res = await (await db()).update(posts).set({ lockedUntil: now + holdMs })
    .where(and(eq(posts.id, id), or(isNull(posts.lockedUntil), lt(posts.lockedUntil, now))))
    .returning({ id: posts.id });
  return res.length === 1;
}

export async function updatePost(id: string, patch: Partial<PostRow>): Promise<void> {
  await (await db()).update(posts).set({ ...patch, updatedAt: Date.now() }).where(eq(posts.id, id));
}

export async function getPost(id: string): Promise<PostRow | undefined> {
  return (await (await db()).select().from(posts).where(eq(posts.id, id)))[0];
}

/** Videos whose SEO never finished (browser closed mid-way), for the job runner to pick up. */
export async function staleSeoVideos(now: number): Promise<VideoRow[]> {
  return (await db()).select().from(videos).where(and(
    eq(videos.uploadState, 'ready'),
    or(eq(videos.seoState, 'pending'), and(eq(videos.seoState, 'working'), lt(videos.seoStartedAt, now - 5 * 60_000))),
  ));
}

/** Marks SEO as being written. False when another request is already writing it. */
export async function claimSeo(id: string, now: number): Promise<boolean> {
  const res = await (await db()).update(videos).set({ seoState: 'working', seoStartedAt: now })
    .where(and(eq(videos.id, id), or(ne(videos.seoState, 'working'), lt(videos.seoStartedAt, now - 5 * 60_000))))
    .returning({ id: videos.id });
  return res.length === 1;
}

export async function saveSeo(id: string, seo: Seo, source: 'claude' | 'draft', note: string | null): Promise<void> {
  await updateVideo(id, { seo, seoSource: source, seoNote: note, seoState: 'ready', seoAt: Date.now() });
}

// ---------- users ----------

export async function countUsers(): Promise<number> {
  return (await (await db()).select({ n: sql<number>`count(*)::int` }).from(users))[0]?.n ?? 0;
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  return (await (await db()).select().from(users).where(eq(users.email, email.toLowerCase())))[0];
}

/** Adds the first user only: false when someone already set up the studio. */
export async function insertFirstUser(row: UserRow): Promise<boolean> {
  if ((await countUsers()) > 0) return false;
  await (await db()).insert(users).values(row).onConflictDoNothing();
  return (await countUsers()) === 1 && !!(await getUserByEmail(row.email));
}

export async function updateUser(id: string, patch: Partial<UserRow>): Promise<void> {
  await (await db()).update(users).set(patch).where(eq(users.id, id));
}

// ---------- Claude helper (runs on the owner's laptop, signed in to Claude) ----------

export async function helperSeen(now: number): Promise<void> {
  await getSettings();
  await (await db()).update(settings).set({ helperSeenAt: now }).where(eq(settings.id, 1));
}

/** Takes up to `limit` videos waiting for Claude. A job not answered in 15 minutes can be taken again. */
export async function claimClaudeJobs(now: number, limit: number): Promise<VideoRow[]> {
  const d = await db();
  const waiting = await d.select().from(videos).where(and(
    eq(videos.uploadState, 'ready'), eq(videos.seoState, 'ready'), sql`${videos.claudeWantedAt} IS NOT NULL`,
    or(isNull(videos.claudeClaimedAt), lt(videos.claudeClaimedAt, now - 15 * 60_000)),
  )).orderBy(asc(videos.claudeWantedAt)).limit(limit);
  const taken: VideoRow[] = [];
  for (const v of waiting) {
    const res = await d.update(videos).set({ claudeClaimedAt: now })
      .where(and(eq(videos.id, v.id), or(isNull(videos.claudeClaimedAt), lt(videos.claudeClaimedAt, now - 15 * 60_000))))
      .returning({ id: videos.id });
    if (res.length) taken.push({ ...v, claudeClaimedAt: now });
  }
  return taken;
}

export async function finishClaudeJob(id: string, patch: Partial<VideoRow>): Promise<void> {
  await updateVideo(id, { ...patch, claudeWantedAt: null, claudeClaimedAt: null });
}

export async function setPlatforms(id: string, platforms: Record<Platform, boolean>): Promise<void> {
  await updateVideo(id, { platforms });
  await resetPosts(id);
}

// ---------- accounts ----------

export async function listAccounts() {
  return (await db()).select().from(accounts);
}

export async function getAccount(platform: Platform) {
  return (await (await db()).select().from(accounts).where(eq(accounts.platform, platform)))[0];
}

export async function saveAccount(row: typeof accounts.$inferInsert): Promise<void> {
  await (await db()).insert(accounts).values(row).onConflictDoUpdate({
    target: accounts.platform,
    set: { externalId: row.externalId, name: row.name, tokens: row.tokens, connectedAt: row.connectedAt },
  });
}

export async function updateAccountTokens(platform: Platform, tokens: string): Promise<void> {
  await (await db()).update(accounts).set({ tokens }).where(eq(accounts.platform, platform));
}

export async function deleteAccount(platform: Platform): Promise<void> {
  await (await db()).delete(accounts).where(eq(accounts.platform, platform));
}

export async function countVideos(): Promise<number> {
  const r = await (await db()).select({ n: sql<number>`count(*)` }).from(videos);
  return Number(r[0]?.n ?? 0);
}
