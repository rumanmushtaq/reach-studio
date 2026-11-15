import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '../db/schema';
import { draftSeo } from '../seo';
import { HOUR, MINUTE } from '../slots';
import { createFacebookPublisher, createInstagramPublisher } from './meta';
import { createTikTokPublisher } from './tiktok';
import { AuthError, PublishError, type PostJob } from './types';

const NOW = Date.UTC(2026, 10, 15, 9, 0);
const SLOT = NOW + 10 * HOUR;

function job(over: Partial<PostRow> = {}, slotAt = SLOT): PostJob {
  const video = {
    id: 'v1', name: 'Leo', note: '', shape: 'vertical', duration: 40, mime: 'video/mp4', slotAt,
    seo: draftSeo({ name: 'Leo', note: '', shape: 'vertical' }),
  } as unknown as PostJob['video'];
  const post = { id: 'p1', videoId: 'v1', platform: 'facebook', state: 'waiting', externalId: null, url: null, attempts: 0, ...over } as PostRow;
  return {
    video, post, now: NOW, links: { youtube: 'https://yt.example/leo', instagram: '', facebook: '', tiktok: '' },
    fileUrl: async () => 'https://files.example/v1.mp4', openFile: async () => { throw new Error('not used'); },
  };
}
const ctx = (tokens: unknown) => ({ externalId: 'page1', tokens, saveTokens: async () => undefined });

function mockFetch(...answers: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; body: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? '') });
    const a = answers.shift() ?? { body: {} };
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('Facebook', () => {
  it('uploads early from the file link and lets Facebook publish at the slot', async () => {
    const calls = mockFetch({ body: { id: 'fbv1' } });
    const r = await createFacebookPublisher().step(job(), ctx({ accessToken: 't' }));
    expect(r).toMatchObject({ state: 'scheduled', runAt: SLOT, externalId: 'fbv1' });
    const sent = new URLSearchParams(calls[0].body);
    expect(calls[0].url).toContain('/page1/videos');
    expect(sent.get('file_url')).toBe('https://files.example/v1.mp4');
    expect(sent.get('published')).toBe('false');
    expect(sent.get('scheduled_publish_time')).toBe(String(Math.floor(SLOT / 1000)));
    expect(sent.get('description')).toContain('https://yt.example/leo');
  });

  it('publishes straight away when the slot is too close to schedule', async () => {
    const calls = mockFetch({ body: { id: 'fbv2' } }, { body: { id: 'c1' } });
    const r = await createFacebookPublisher().step(job({}, NOW + 5 * MINUTE), ctx({ accessToken: 't' }));
    expect(r.state).toBe('live');
    expect(new URLSearchParams(calls[0].body).get('published')).toBe('true');
  });

  it('asks for a reconnect when the token is dead', async () => {
    mockFetch({ status: 401, body: { error: { code: 190, message: 'expired' } } });
    await expect(createFacebookPublisher().step(job(), ctx({ accessToken: 't' }))).rejects.toBeInstanceOf(AuthError);
  });
});

describe('Instagram', () => {
  it('stages a Reels container early, then publishes it at the slot', async () => {
    mockFetch({ body: { id: 'cont1' } });
    const staged = await createInstagramPublisher().step(job({ platform: 'instagram' }), ctx({ accessToken: 't' }));
    expect(staged).toMatchObject({ state: 'staged', externalId: 'cont1', runAt: SLOT });

    mockFetch({ body: { status_code: 'FINISHED' } }, { body: { id: 'media1' } }, { body: { permalink: 'https://instagram.com/reel/x' } }, { body: {} });
    const atSlot = { ...job({ platform: 'instagram', state: 'staged', externalId: 'cont1' }), now: SLOT };
    expect(await createInstagramPublisher().step(atSlot, ctx({ accessToken: 't' }))).toMatchObject({ state: 'live', url: 'https://instagram.com/reel/x' });
  });

  it('waits while Instagram is still processing', async () => {
    mockFetch({ body: { status_code: 'IN_PROGRESS' } });
    const atSlot = { ...job({ platform: 'instagram', state: 'staged', externalId: 'cont1' }), now: SLOT };
    expect(await createInstagramPublisher().step(atSlot, ctx({ accessToken: 't' }))).toEqual({ state: 'wait', runAt: SLOT + 5 * MINUTE });
  });
});

describe('TikTok via Upload-Post', () => {
  it('posts with the file link and returns the TikTok url', async () => {
    mockFetch({ body: { success: true, results: { tiktok: { success: true, url: 'https://tiktok.com/@x/1' } } } });
    expect(await createTikTokPublisher().step(job({ platform: 'tiktok' }), ctx({ apiKey: 'k', user: 'u' }))).toEqual({ state: 'live', url: 'https://tiktok.com/@x/1' });
  });

  it('retries server errors but not rejected uploads', async () => {
    mockFetch({ status: 502, body: {} });
    await expect(createTikTokPublisher().step(job({ platform: 'tiktok' }), ctx({ apiKey: 'k', user: 'u' }))).rejects.toMatchObject({ retryable: true });
    mockFetch({ body: { results: { tiktok: { success: false, error: 'too long' } } } });
    const err = await createTikTokPublisher().step(job({ platform: 'tiktok' }), ctx({ apiKey: 'k', user: 'u' })).catch((e) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect(err.retryable).toBe(false);
  });
});
