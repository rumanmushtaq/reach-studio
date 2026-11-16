import { describe, expect, it } from 'vitest';
import { attentionItems } from './attention';
import { HOUR } from './slots';

const NOW = Date.UTC(2026, 10, 15, 9, 0);
const all = { youtube: true, facebook: true, instagram: true, tiktok: true };
const v = (id: string, over = {}) => ({ id, name: id, createdAt: NOW - 2 * HOUR, uploadState: 'ready' as const, seoState: 'ready' as const, slotAt: NOW + 5 * HOUR, platforms: all, fileDeletedAt: null, ...over });
const p = (videoId: string, platform: 'youtube' | 'facebook' | 'instagram' | 'tiktok', state: 'waiting' | 'live' | 'failed', lastError: string | null = null) =>
  ({ id: `${videoId}-${platform}`, videoId, platform, state, lastError, runAt: 0, attempts: 0, url: null, updatedAt: NOW });
const connected = { youtube: 'Leo', facebook: 'Leo Page', instagram: null, tiktok: 'leo' };

describe('needs you', () => {
  it('lists failed posts, missing accounts in use, and stuck uploads', () => {
    const items = attentionItems(
      [v('Rain Song'), v('Old', { slotAt: NOW - HOUR }), v('Stuck', { uploadState: 'uploading', slotAt: null })],
      [p('Rain Song', 'tiktok', 'failed', 'Upload-Post rejected the API key.'), p('Rain Song', 'youtube', 'live'), p('Rain Song', 'facebook', 'live')],
      connected, NOW,
    );
    expect(items.map((i) => i.title)).toEqual([
      'Rain Song did not post to TikTok',
      'Instagram is not connected',
      'Stuck did not finish uploading',
    ]);
    expect(items[0].detail).toBe('Upload-Post rejected the API key. 2 other platforms are live.');
    expect(items[1].detail).toBe('1 upcoming video is set to post there. The first goes live Sun 15 Nov 7:00 PM.');
  });

  it('ignores accounts nobody needs and platforms switched off', () => {
    const off = { ...all, instagram: false };
    expect(attentionItems([v('A', { platforms: off })], [p('A', 'instagram', 'failed')], connected, NOW)).toEqual([]);
  });
});
