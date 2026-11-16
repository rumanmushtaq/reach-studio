import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '../db/schema';
import { draftSeo } from '../seo';
import { HOUR, MINUTE } from '../slots';
import { AuthError, PublishError, type PostJob } from './types';

// A fake YouTube API: records calls, answers like Google does.
const yt = {
  videos: { insert: vi.fn(), update: vi.fn() },
  playlists: { list: vi.fn(), insert: vi.fn() },
  playlistItems: { insert: vi.fn() },
  thumbnails: { set: vi.fn() },
};
vi.mock('@googleapis/youtube', () => ({
  youtube: () => yt,
  auth: { OAuth2: class { setCredentials() {} on() {} } },
}));

const { createYouTubePublisher } = await import('./youtube');

const NOW = Date.UTC(2026, 10, 15, 9, 0);
const SLOT = NOW + 10 * HOUR;

function job(over: Partial<PostRow> = {}, video: Partial<PostJob['video']> = {}): PostJob {
  return {
    video: {
      id: 'v1', name: 'Leo', note: '', shape: 'horizontal', duration: 372, mime: 'video/mp4', slotAt: SLOT,
      seo: draftSeo({ name: 'Leo', note: '', shape: 'horizontal' }), ...video,
    } as unknown as PostJob['video'],
    post: { id: 'p1', videoId: 'v1', platform: 'youtube', state: 'waiting', externalId: null, url: null, attempts: 0, ...over } as PostRow,
    now: NOW,
    links: { youtube: '', instagram: 'https://instagram.com/leo', facebook: '', tiktok: '' },
    fileUrl: async () => 'https://files.example/v1.mp4',
    openFile: async () => Readable.from(['video-bytes']),
    openThumb: null,
  };
}
const ctx = { externalId: 'chan1', tokens: { refresh_token: 'r' }, saveTokens: async () => undefined };

beforeEach(() => {
  vi.clearAllMocks();
  yt.videos.insert.mockResolvedValue({ data: { id: 'yt123' } });
  yt.videos.update.mockResolvedValue({ data: {} });
  yt.playlists.list.mockResolvedValue({ data: { items: [{ id: 'pl1', snippet: { title: 'Urdu Cartoon Stories' } }] } });
  yt.playlistItems.insert.mockResolvedValue({ data: {} });
  yt.thumbnails.set.mockResolvedValue({ data: {} });
});

describe('YouTube', () => {
  it('uploads early as private, scheduled for the slot, made for kids, with links and tags', async () => {
    const r = await createYouTubePublisher().step(job(), ctx);
    expect(r).toEqual({ state: 'scheduled', runAt: SLOT, externalId: 'yt123', url: 'https://youtu.be/yt123' });
    const body = yt.videos.insert.mock.calls[0][0].requestBody;
    expect(body.status).toEqual({ privacyStatus: 'private', publishAt: new Date(SLOT).toISOString(), selfDeclaredMadeForKids: true });
    expect(body.snippet.description).toContain('https://instagram.com/leo');
    expect(body.snippet.description).toContain('#urducartoon');
    expect(body.snippet.tags).toContain('urdu cartoon');
    expect(body.snippet.categoryId).toBe('1');
  });

  it('adds the video to the playlist Claude named, creating it when missing', async () => {
    await createYouTubePublisher().step(job(), ctx);
    expect(yt.playlistItems.insert.mock.calls[0][0].requestBody.snippet).toMatchObject({ playlistId: 'pl1', resourceId: { videoId: 'yt123' } });

    yt.playlists.list.mockResolvedValue({ data: { items: [] } });
    yt.playlists.insert.mockResolvedValue({ data: { id: 'plNew' } });
    await createYouTubePublisher().step(job(), ctx);
    expect(yt.playlists.insert).toHaveBeenCalledTimes(1);
    expect(yt.playlistItems.insert.mock.calls[1][0].requestBody.snippet.playlistId).toBe('plNew');
  });

  it('sets the owner thumbnail, and keeps going when YouTube refuses it (unverified channel)', async () => {
    const withThumb = { ...job(), openThumb: async () => Readable.from(['jpg']) };
    await createYouTubePublisher().step(withThumb, ctx);
    expect(yt.thumbnails.set.mock.calls[0][0].videoId).toBe('yt123');
    yt.thumbnails.set.mockRejectedValueOnce({ response: { status: 403 } });
    expect((await createYouTubePublisher().step(withThumb, ctx)).state).toBe('scheduled');
    await createYouTubePublisher().step(job(), ctx);
    expect(yt.thumbnails.set).toHaveBeenCalledTimes(2);
  });

  it('still uploads when the playlist step fails', async () => {
    yt.playlists.list.mockRejectedValue(new Error('playlist down'));
    expect((await createYouTubePublisher().step(job(), ctx)).state).toBe('scheduled');
  });

  it('publishes at once when the slot is too close to schedule, with a Shorts link for short vertical videos', async () => {
    const r = await createYouTubePublisher().step(job({}, { slotAt: NOW + 5 * MINUTE, shape: 'vertical', duration: 40 }), ctx);
    expect(r).toEqual({ state: 'live', externalId: 'yt123', url: 'https://youtube.com/shorts/yt123' });
    expect(yt.videos.insert.mock.calls[0][0].requestBody.status.privacyStatus).toBe('public');
  });

  it('moves the publish time on YouTube when the slot moved, and goes live at the slot', async () => {
    const scheduled = job({ state: 'scheduled', externalId: 'yt123', url: 'https://youtu.be/yt123' });
    expect(await createYouTubePublisher().step(scheduled, ctx)).toMatchObject({ state: 'scheduled', runAt: SLOT });
    expect(yt.videos.update.mock.calls[0][0].requestBody.status.publishAt).toBe(new Date(SLOT).toISOString());

    const atSlot = { ...scheduled, now: SLOT };
    expect(await createYouTubePublisher().step(atSlot, ctx)).toEqual({ state: 'live', externalId: 'yt123', url: 'https://youtu.be/yt123' });
    expect(yt.videos.update).toHaveBeenCalledTimes(1);
  });

  it('maps Google errors: expired sign-in, daily quota, server trouble, bad request', async () => {
    const fail = async (err: unknown) => {
      yt.videos.insert.mockRejectedValueOnce(err);
      return createYouTubePublisher().step(job(), ctx).catch((e) => e);
    };
    expect(await fail({ message: 'invalid_grant' })).toBeInstanceOf(AuthError);
    expect(await fail({ response: { status: 401 } })).toBeInstanceOf(AuthError);
    const quota = await fail({ response: { status: 403, data: { error: { errors: [{ reason: 'uploadLimitExceeded' }] } } } });
    expect(quota).toBeInstanceOf(PublishError);
    expect(quota.retryable).toBe(true);
    expect((await fail({ response: { status: 503 } })).retryable).toBe(true);
    expect((await fail({ response: { status: 400 }, message: 'Bad title' })).retryable).toBe(false);
  });
});
