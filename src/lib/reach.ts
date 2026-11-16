// Reach checklist: quick, rule-based checks of a video's SEO for each platform.
// Pure, shared by the server and the browser. Each check says what is good or what to fix.
import type { Links, Platform, Seo } from './seo';

export type Check = { ok: boolean; text: string };

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function reachChecks(p: Platform, seo: Seo, ctx: { links: Partial<Links>; customThumb: boolean }): Check[] {
  const hasLinks = Object.values(ctx.links).some((l) => !!l?.trim());
  if (p === 'youtube') {
    const y = seo.youtube;
    const tagChars = y.tags.join(',').length;
    return [
      y.title.length >= 30 && y.title.length <= 100
        ? { ok: true, text: `Title is ${y.title.length} of 100 characters` }
        : { ok: false, text: y.title.length > 100 ? 'Title is over 100 characters: YouTube cuts it' : 'Title is short: add the story name and "Urdu Cartoon"' },
      lines(y.description).length >= 2 && lines(y.description)[0].length <= 150
        ? { ok: true, text: 'First lines are a short hook' }
        : { ok: false, text: 'Start the description with a 1–2 line hook: it shows before "more"' },
      y.tags.length >= 10 && tagChars <= 500
        ? { ok: true, text: `${y.tags.length} tags (${tagChars} of 500 characters)` }
        : { ok: false, text: tagChars > 500 ? 'Tags are over 500 characters: remove a few' : 'Add more tags: aim for 15 or more' },
      y.hashtags.length >= 1 && y.hashtags.length <= 5
        ? { ok: true, text: `${y.hashtags.length} hashtags` }
        : { ok: false, text: y.hashtags.length ? 'Keep 3 hashtags: more than 5 looks spammy' : 'Add 3 hashtags' },
      hasLinks ? { ok: true, text: 'Channel links added at the end' } : { ok: false, text: 'Add your channel links in Settings' },
      y.playlist.trim() ? { ok: true, text: `In playlist "${y.playlist.trim()}"` } : { ok: false, text: 'Name a playlist: viewers keep watching' },
      ctx.customThumb
        ? { ok: true, text: 'Custom thumbnail uploaded' }
        : { ok: false, text: 'Upload a custom thumbnail: it shows bigger than the title' },
    ];
  }
  if (p === 'facebook') {
    const f = seo.facebook;
    return [
      f.title.trim() ? { ok: true, text: 'Title set' } : { ok: false, text: 'Add a title' },
      lines(f.description).length >= 1 ? { ok: true, text: 'Description has a hook' } : { ok: false, text: 'Add a short description' },
      f.hashtags.length >= 3 && f.hashtags.length <= 5 ? { ok: true, text: `${f.hashtags.length} hashtags` } : { ok: false, text: 'Use 3 to 5 hashtags' },
      f.pinned.trim() ? { ok: true, text: 'First comment ready' } : { ok: false, text: 'Add a first comment to start the conversation' },
      hasLinks ? { ok: true, text: 'Channel links added' } : { ok: false, text: 'Add your channel links in Settings' },
    ];
  }
  if (p === 'instagram') {
    const i = seo.instagram;
    return [
      i.caption.length <= 2200 && i.caption.trim() ? { ok: true, text: 'Caption fits' } : { ok: false, text: i.caption.trim() ? 'Caption is over 2,200 characters' : 'Add a caption' },
      i.hashtags.length >= 10 && i.hashtags.length <= 30 ? { ok: true, text: `${i.hashtags.length} hashtags` } : { ok: false, text: i.hashtags.length > 30 ? 'Instagram allows 30 hashtags at most' : 'Use 20 to 30 hashtags on Reels' },
      words(i.coverText) >= 1 && words(i.coverText) <= 4 ? { ok: true, text: 'Cover text is short' } : { ok: false, text: 'Keep cover text to 4 words' },
      i.pinned.trim() ? { ok: true, text: 'First comment ready' } : { ok: false, text: 'Add a first comment' },
    ];
  }
  const t = seo.tiktok;
  return [
    t.caption.trim() && t.caption.length <= 2200 ? { ok: true, text: 'Caption fits' } : { ok: false, text: 'Add a caption under 2,200 characters' },
    t.hashtags.length >= 3 && t.hashtags.length <= 5 ? { ok: true, text: `${t.hashtags.length} hashtags` } : { ok: false, text: 'Use 3 to 5 hashtags' },
  ];
}
