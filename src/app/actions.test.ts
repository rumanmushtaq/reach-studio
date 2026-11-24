import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Rewrite with Claude on a real (in-memory) Postgres.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

let actions: typeof import('./actions');
let repo: typeof import('@/lib/repo');

beforeAll(async () => {
  process.chdir(await mkdtemp(path.join(os.tmpdir(), 'reach-actions-')));
  process.env.SUPABASE_DATABASE_URL = 'memory://';
  process.env.STUDIO_SECRET = 'test-secret'; // signs local file links
  delete process.env.CLOUDINARY_URL;
  delete process.env.GITHUB_ACTIONS_TOKEN;
  [actions, repo] = await Promise.all([import('./actions'), import('@/lib/repo')]);
});

async function addVideo(id: string, youtubeState: 'waiting' | 'scheduled') {
  const now = Date.now();
  await repo.insertVideo({
    id, name: 'Gholu', note: '', fileName: 'g.mp4', fileKey: `videos/${id}/g.mp4`, fileSize: 5, mime: 'video/mp4',
    duration: 60, width: 1080, height: 1920, shape: 'vertical', thumbKey: null, customThumbKey: null, frameKeys: [],
    platforms: { youtube: true, facebook: false, instagram: false, tiktok: false }, uploadState: 'ready',
    seo: null, seoSource: 'draft', seoState: 'ready', seoNote: null, seoStartedAt: null, seoAt: now, claudeWantedAt: null, claudeClaimedAt: null, research: null,
    slotAt: now + 86_400_000, fileDeletedAt: null, createdAt: now,
  });
  await repo.resetPosts(id);
  if (youtubeState === 'scheduled') {
    const [post] = await repo.listPosts([id]);
    await repo.updatePost(post.id, { state: 'scheduled', externalId: 'yt1' });
  }
}

describe('Rewrite with Claude', { timeout: 60_000 }, () => {
  it('asks Claude while nothing is uploaded yet', async () => {
    await addVideo('fresh', 'waiting');
    const r = await actions.rewriteSeo('fresh');
    expect(r).toEqual({ ok: true, message: expect.stringContaining('Queued') });
    expect((await repo.getVideo('fresh'))?.claudeWantedAt).toBeTruthy();
  });

  it('says why when the video is already uploaded, and does not queue it', async () => {
    await addVideo('sent', 'scheduled');
    const r = await actions.rewriteSeo('sent');
    expect(r).toEqual({ ok: false, error: expect.stringContaining('already uploaded') });
    expect((await repo.getVideo('sent'))?.claudeWantedAt).toBeNull();
  });
});

describe('Post to TikTok (helper extension)', { timeout: 60_000 }, () => {
  it('hands the helper the video link and the TikTok caption with its hashtags', async () => {
    await addVideo('tt', 'waiting');
    await repo.updateVideo('tt', { seo: { ...(await import('@/lib/seo')).draftSeo({ name: 'Gholu', note: '', shape: 'vertical' }), tiktok: { caption: 'Gholu ki shararat!', hashtags: ['#gholu', '#urducartoon'] } } });
    const r = await actions.tiktokJob('tt');
    expect(r).toEqual({ ok: true, job: { name: 'Gholu', fileName: 'g.mp4', videoUrl: expect.stringContaining('videos/tt/g.mp4'), caption: 'Gholu ki shararat!\n\n#gholu #urducartoon', slotAt: expect.any(Number), slotLabel: expect.stringMatching(/^\w{3} \d{1,2} \w{3} \d{1,2}:\d{2} (AM|PM)$/) } });
  });

  it('says why when the file is gone', async () => {
    await repo.updateVideo('tt', { fileDeletedAt: Date.now() });
    expect(await actions.tiktokJob('tt')).toEqual({ ok: false, error: expect.stringContaining('cleaned up') });
  });
});
