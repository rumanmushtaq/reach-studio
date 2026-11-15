import { mkdtemp, mkdir, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PostJob, StepResult } from './publishers/types';

// The whole posting run on a real (in-memory) Postgres, with fake platforms and a fake clock:
// SEO → slot → early uploads → a retry → a failure and manual Retry → live → next-day cleanup.

type Step = (job: PostJob) => Promise<StepResult>;
const fake: Record<string, Step> = {};
const calls: string[] = [];
const publisher = (name: string) => ({ step: (job: PostJob) => { calls.push(`${name}:${job.post.state}`); return fake[name](job); } });
vi.mock('./publishers/youtube', () => ({ createYouTubePublisher: () => publisher('youtube') }));
vi.mock('./publishers/meta', () => ({ createFacebookPublisher: () => publisher('facebook'), createInstagramPublisher: () => publisher('instagram') }));
vi.mock('./publishers/tiktok', () => ({ createTikTokPublisher: () => publisher('tiktok') }));

let svc: typeof import('./services');
let repo: typeof import('./repo');
let plan: typeof import('./plan');
let types: typeof import('./publishers/types');
let storage: typeof import('./storage');
let slots: typeof import('./slots');

const START = Date.UTC(2026, 10, 15, 9, 0); // Sun 15 Nov, 2:00 PM Pakistan time
const setNow = (ms: number) => vi.setSystemTime(ms);

beforeAll(async () => {
  process.chdir(await mkdtemp(path.join(os.tmpdir(), 'reach-test-')));
  process.env.DATABASE_URL = 'memory://';
  process.env.STUDIO_SECRET = 'test-secret';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.R2_BUCKET;
  vi.useFakeTimers({ toFake: ['Date'] });
  setNow(START);
  [svc, repo, plan, types, storage, slots] = await Promise.all([
    import('./services'), import('./repo'), import('./plan'), import('./publishers/types'), import('./storage'), import('./slots'),
  ]);
});
afterAll(() => vi.useRealTimers());

async function status(id: string) {
  const v = (await repo.getVideo(id))!;
  return plan.videoStatus(v, await repo.listPosts([id]), Date.now()).label;
}
async function postState(id: string) {
  return Object.fromEntries((await repo.listPosts([id])).map((p) => [p.platform, p.state]));
}

describe('job runner', { timeout: 120_000 }, () => {
  it('runs a video from upload to live on every platform, then cleans up the file', async () => {
    const { encrypt } = await import('./crypto');
    for (const platform of ['youtube', 'facebook', 'instagram', 'tiktok'] as const) {
      await repo.saveAccount({ platform, externalId: `${platform}-id`, name: platform, tokens: encrypt('{"accessToken":"t"}'), connectedAt: START });
    }

    // A finished upload whose browser closed before SEO started.
    const fileKey = 'videos/v1/video.mp4';
    await mkdir(path.dirname(storage.localPath(fileKey)), { recursive: true });
    await writeFile(storage.localPath(fileKey), 'video');
    await repo.insertVideo({
      id: 'v1', name: 'Leo and the Magic Lamp', note: 'Leo finds a lamp', fileName: 'leo.mp4', fileKey, fileSize: 5, mime: 'video/mp4',
      duration: 45, width: 1080, height: 1920, shape: 'vertical', thumbKey: null, frameKeys: [],
      platforms: { youtube: true, facebook: true, instagram: true, tiktok: true }, uploadState: 'ready',
      seo: null, seoSource: null, seoState: 'pending', seoNote: null, seoStartedAt: null, seoAt: null,
      slotAt: null, fileDeletedAt: null, createdAt: START,
    });

    // Fake platforms, written like the real ones.
    let fbFails = 1;
    let tiktokAuthBroken = true;
    fake.youtube = async (j) => (j.post.state === 'waiting' || j.now < j.video.slotAt
      ? { state: 'scheduled', runAt: j.video.slotAt, externalId: 'yt1', url: 'https://youtu.be/yt1' }
      : { state: 'live', url: j.post.url });
    fake.facebook = async (j) => {
      if (fbFails-- > 0) throw new types.PublishError('Facebook is busy', true);
      return j.post.state === 'waiting' ? { state: 'scheduled', runAt: j.video.slotAt, externalId: 'fb1' } : { state: 'live', url: 'https://fb.com/v/fb1' };
    };
    fake.instagram = async (j) => (j.post.state === 'waiting'
      ? { state: 'staged', runAt: j.video.slotAt, externalId: 'cont1' }
      : { state: 'live', url: 'https://instagram.com/reel/1' });
    fake.tiktok = async () => {
      if (tiktokAuthBroken) throw new types.AuthError('Upload-Post rejected the API key. Reconnect TikTok in Accounts.');
      return { state: 'live', url: 'https://tiktok.com/@leo/1' };
    };

    // Tick 1: SEO is written (basic draft, no Claude key) and the first free slot is booked: today 7 PM.
    // The early-upload time (1:00 PM) is already past at 2:00 PM, so YouTube and Facebook run in the same tick.
    // Facebook fails once and waits for its retry.
    expect((await svc.tick())).toMatchObject({ seo: 1, posts: 2 });
    const v = (await repo.getVideo('v1'))!;
    const slot = slots.at(slots.dayStart(START), '19:00');
    expect(v.seoState).toBe('ready');
    expect(v.seoSource).toBe('draft');
    expect(v.seoNote).toContain('ANTHROPIC_API_KEY');
    expect(v.seo?.youtube.title).toContain('Leo and the Magic Lamp');
    expect(v.slotAt).toBe(slot);
    expect(await postState('v1')).toEqual({ youtube: 'scheduled', facebook: 'waiting', instagram: 'waiting', tiktok: 'waiting' });
    const fb = (await repo.listPosts(['v1'])).find((p) => p.platform === 'facebook')!;
    expect(fb.attempts).toBe(1);
    expect(fb.lastError).toBe('Facebook is busy');
    expect(fb.runAt).toBe(START + 15 * slots.MINUTE);
    expect(await status('v1')).toBe('Uploaded early');

    // Nothing else is due yet: a second tick does nothing.
    expect((await svc.tick()).posts).toBe(0);

    // 15 minutes later Facebook's retry works.
    setNow(START + 15 * slots.MINUTE);
    await svc.tick();
    expect(await postState('v1')).toMatchObject({ facebook: 'scheduled' });

    // 6:00 PM: Instagram's container is staged. TikTok is not due yet.
    setNow(slot - slots.HOUR);
    await svc.tick();
    expect(await postState('v1')).toEqual({ youtube: 'scheduled', facebook: 'scheduled', instagram: 'staged', tiktok: 'waiting' });

    // 7:00 PM: everything goes live, except TikTok, whose key was rejected: failed at once, no retries.
    setNow(slot);
    await svc.tick();
    expect(await postState('v1')).toEqual({ youtube: 'live', facebook: 'live', instagram: 'live', tiktok: 'failed' });
    expect(await status('v1')).toBe('Post failed');
    const tt = (await repo.listPosts(['v1'])).find((p) => p.platform === 'tiktok')!;
    expect(tt.lastError).toContain('Reconnect TikTok');

    // Owner fixes the key and presses Retry.
    tiktokAuthBroken = false;
    await svc.retryPost(tt.id);
    await svc.tick();
    expect(await postState('v1')).toEqual({ youtube: 'live', facebook: 'live', instagram: 'live', tiktok: 'live' });
    expect(await status('v1')).toBe('Live');
    expect((await repo.listPosts(['v1'])).find((p) => p.platform === 'tiktok')!.url).toBe('https://tiktok.com/@leo/1');

    // Same day: the file stays. Next morning: the file is deleted, the record stays.
    await svc.tick();
    await expect(access(storage.localPath(fileKey))).resolves.toBeUndefined();
    setNow(slots.dayStart(slot) + slots.DAY + 9 * slots.HOUR);
    expect((await svc.tick()).cleaned).toBe(1);
    await expect(access(storage.localPath(fileKey))).rejects.toThrow();
    expect((await repo.getVideo('v1'))!.fileDeletedAt).toBe(Date.now());

    // Each platform was called exactly as planned, no double posts (posts due the same minute run in any order).
    expect([...calls].sort()).toEqual([
      'youtube:waiting', 'facebook:waiting', 'facebook:waiting', 'instagram:waiting',
      'youtube:scheduled', 'facebook:scheduled', 'instagram:staged', 'tiktok:waiting', 'tiktok:waiting',
    ].sort());
  });

  it('books slots in order and moves a scheduled upload when the slot moves', async () => {
    setNow(START);
    const base = (await repo.getVideo('v1'))!;
    for (const id of ['v2', 'v3']) {
      await repo.insertVideo({ ...base, id, slotAt: null, seo: null, seoState: 'pending', fileDeletedAt: null, fileKey: `videos/${id}/video.mp4` });
      await svc.runSeo(id);
    }
    const v2 = (await repo.getVideo('v2'))!;
    const v3 = (await repo.getVideo('v3'))!;
    const today7pm = slots.at(slots.dayStart(START), '19:00');
    // v1 holds today 7 PM, so v2 and v3 take the next two days.
    expect(v2.slotAt).toBe(today7pm + slots.DAY);
    expect(v3.slotAt).toBe(today7pm + 2 * slots.DAY);

    // v2 uploads early to YouTube, then the owner moves it: the post stays scheduled and runs now to update YouTube.
    setNow(v2.slotAt! - 6 * slots.HOUR);
    await svc.tick();
    const yt = () => repo.listPosts(['v2']).then((ps) => ps.find((p) => p.platform === 'youtube')!);
    expect((await yt()).state).toBe('scheduled');
    const later = today7pm + 5 * slots.DAY;
    await repo.updateVideo('v2', { slotAt: later });
    await repo.resetPosts('v2');
    expect((await yt())).toMatchObject({ state: 'scheduled', externalId: 'yt1', runAt: Date.now() });
    calls.length = 0;
    await svc.tick();
    expect(calls).toContain('youtube:scheduled');
    expect((await yt()).runAt).toBe(later);
  });

  it('fails with a clear message when a platform is not connected', async () => {
    await repo.deleteAccount('instagram');
    const v3 = (await repo.getVideo('v3'))!;
    setNow(v3.slotAt! - slots.HOUR);
    await svc.tick();
    const ig = (await repo.listPosts(['v3'])).find((p) => p.platform === 'instagram')!;
    expect(ig.state).toBe('failed');
    expect(ig.lastError).toBe('Instagram is not connected. Connect it in Accounts, then press Retry.');
  });

  it('keeps a picked time, and holds its posts until the SEO is written', async () => {
    setNow(START);
    const picked = slots.fromPkt('2026-11-15', '15:30')!; // today 3:30 PM, picked at upload
    const base = (await repo.getVideo('v1'))!;
    await repo.insertVideo({
      ...base, id: 'v4', name: 'Picked Time', slotAt: picked, seo: null, seoSource: null, seoNote: null,
      seoState: 'working', seoStartedAt: START, seoAt: null, fileDeletedAt: null, fileKey: 'videos/v4/video.mp4',
    });
    await repo.resetPosts('v4'); // what the upload-finished route does for a picked time
    const yt = () => repo.listPosts(['v4']).then((ps) => ps.find((p) => p.platform === 'youtube')!);
    expect((await yt()).runAt).toBe(START); // early upload is already due: 3:30 PM minus 6 hours is in the past

    // SEO still being written: the due post waits instead of failing.
    calls.length = 0;
    await svc.tick();
    expect(calls.filter((c) => c.startsWith('youtube'))).toEqual([]);
    expect(await yt()).toMatchObject({ state: 'waiting', runAt: START + 5 * slots.MINUTE, attempts: 0, lastError: null });
    expect(await status('v4')).toBe('Writing SEO…');

    // The SEO finishes; the picked time is not replaced by a daily slot.
    await repo.updateVideo('v4', { seoState: 'pending' });
    await svc.tick();
    expect((await repo.getVideo('v4'))!).toMatchObject({ seoState: 'ready', slotAt: picked });

    // Five minutes later the upload runs, scheduled for the picked time.
    setNow(START + 5 * slots.MINUTE);
    await svc.tick();
    expect(calls).toContain('youtube:waiting');
    expect(await yt()).toMatchObject({ state: 'scheduled', runAt: picked });
  });
});
