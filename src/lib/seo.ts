// SEO pack: shape, per-platform limits, the basic draft, and normalising Claude's answer.
// Pure, shared by the server and the browser.
import { z } from 'zod';

export const PLATFORMS = ['youtube', 'facebook', 'instagram', 'tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_NAMES: Record<Platform, string> = {
  youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok',
};
export const PLATFORM_SHORT: Record<Platform, string> = { youtube: 'YT', facebook: 'FB', instagram: 'IG', tiktok: 'TT' };

export const SeoSchema = z.object({
  youtube: z.object({
    title: z.string(), description: z.string(), tags: z.array(z.string()), hashtags: z.array(z.string()),
    thumbText: z.string(), playlist: z.string(),
  }),
  facebook: z.object({ title: z.string(), description: z.string(), hashtags: z.array(z.string()), pinned: z.string() }),
  instagram: z.object({ caption: z.string(), hashtags: z.array(z.string()), pinned: z.string(), coverText: z.string() }),
  tiktok: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
});
export type Seo = z.infer<typeof SeoSchema>;

export type FieldKind = 'line' | 'text' | 'list';
export type FieldDef = { key: string; label: string; kind: FieldKind; max: number; count?: 'items' | 'chars' };

export const FIELDS: { [P in Platform]: FieldDef[] } = {
  youtube: [
    { key: 'title', label: 'Title', kind: 'line', max: 100 },
    { key: 'description', label: 'Description', kind: 'text', max: 5000 },
    { key: 'tags', label: 'Tags, comma separated', kind: 'list', max: 500, count: 'chars' },
    { key: 'hashtags', label: 'Hashtags', kind: 'list', max: 15, count: 'items' },
    { key: 'thumbText', label: 'Thumbnail text idea', kind: 'line', max: 40 },
    { key: 'playlist', label: 'Playlist', kind: 'line', max: 150 },
  ],
  facebook: [
    { key: 'title', label: 'Title', kind: 'line', max: 255 },
    { key: 'description', label: 'Description', kind: 'text', max: 5000 },
    { key: 'hashtags', label: 'Hashtags', kind: 'list', max: 10, count: 'items' },
    { key: 'pinned', label: 'First comment', kind: 'text', max: 500 },
  ],
  instagram: [
    { key: 'caption', label: 'Reel caption', kind: 'text', max: 2200 },
    { key: 'hashtags', label: 'Hashtags', kind: 'list', max: 30, count: 'items' },
    { key: 'pinned', label: 'First comment', kind: 'text', max: 500 },
    { key: 'coverText', label: 'Cover text idea', kind: 'line', max: 40 },
  ],
  tiktok: [
    { key: 'caption', label: 'Caption', kind: 'text', max: 2200 },
    { key: 'hashtags', label: 'Hashtags', kind: 'list', max: 10, count: 'items' },
  ],
};

/** How full a field is against its limit. */
export function fieldUse(value: string | string[], def: FieldDef): { used: number; over: boolean } {
  const used = Array.isArray(value) ? (def.count === 'items' ? value.length : value.join(',').length) : value.length;
  return { used, over: used > def.max };
}

export function splitList(text: string | string[]): string[] {
  const parts = Array.isArray(text) ? text : text.split(',');
  return parts.map((s) => String(s).trim()).filter(Boolean);
}

export function toHashtags(items: string | string[]): string[] {
  return splitList(items)
    .map((h) => '#' + h.replace(/^#+/, '').replace(/\s+/g, ''))
    .filter((h) => h.length > 1);
}

export type VideoBrief = { name: string; note: string; shape: 'vertical' | 'horizontal' };

/** Used when Claude is not configured or fails. Good enough to post. */
export function draftSeo(v: VideoBrief): Seo {
  const name = v.name.trim() || 'New cartoon';
  const hook = v.note.trim() ? v.note.trim().replace(/\.$/, '') + '.' : 'A new story for kids.';
  const short = name.split(/\s+/).slice(0, 3).join(' ');
  const tags = ['urdu cartoon', 'kids cartoon', 'cartoon in urdu', 'bachon ki kahani', 'kids stories',
    'moral stories for kids', 'urdu kahaniyan', 'animated story', name.toLowerCase()];
  return {
    youtube: {
      title: `${name} | Urdu Cartoon for Kids`.slice(0, 100),
      description: `${hook}\nNayi kahani, naye dost! Watch till the end.\n\nبچوں کے لیے نئی کارٹون کہانی`,
      tags, hashtags: ['#urducartoon', '#kidsstories', '#cartoon'],
      thumbText: short.toUpperCase(), playlist: v.shape === 'vertical' ? 'Shorts for Kids' : 'Urdu Cartoon Stories',
    },
    facebook: {
      title: `${name} | Kids Cartoon in Urdu`, description: `${hook}\nShare with your little ones!`,
      hashtags: ['#urducartoon', '#kidsstories', '#cartoon'], pinned: 'Comment your favourite character!',
    },
    instagram: {
      caption: `${name} ✨ ${hook}`,
      hashtags: ['#urducartoon', '#kidsstories', '#cartoon', '#kidsreels', '#bachonkikahani', '#animation', '#pakistanikids', '#storytime'],
      pinned: 'Follow for a new story every day!', coverText: short,
    },
    tiktok: { caption: `${name} ${hook}`, hashtags: ['#urducartoon', '#kidsstory', '#fyp'] },
  };
}

/** Coerce anything shaped roughly like an SEO pack into a valid one, filling gaps from the draft. */
export function normaliseSeo(input: unknown, v: VideoBrief): Seo {
  const draft = draftSeo(v) as Record<Platform, Record<string, string | string[]>>;
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, Record<string, unknown>>;
  const out = {} as Record<Platform, Record<string, string | string[]>>;
  for (const p of PLATFORMS) {
    const s = src[p] && typeof src[p] === 'object' ? src[p] : {};
    out[p] = {};
    for (const f of FIELDS[p]) {
      const raw = s[f.key] ?? draft[p][f.key];
      if (f.kind === 'list') {
        const items = Array.isArray(raw) || typeof raw === 'string' ? (raw as string | string[]) : draft[p][f.key];
        out[p][f.key] = f.key === 'hashtags' ? toHashtags(items) : splitList(items);
      } else {
        out[p][f.key] = typeof raw === 'string' ? raw.trim() : String(draft[p][f.key]);
      }
    }
  }
  const seo = SeoSchema.parse(out);
  seo.youtube.title = seo.youtube.title.replace(/[<>]/g, '').slice(0, 100);
  return seo;
}

/** Default platforms from the video's shape: shorts go everywhere, long videos to YouTube and Facebook. */
export function defaultPlatforms(shape: 'vertical' | 'horizontal', durationSec: number | null): Record<Platform, boolean> {
  const short = shape === 'vertical' && (!durationSec || durationSec <= 90);
  return { youtube: true, facebook: true, instagram: short, tiktok: short };
}

export type Links = Record<Platform, string>;

/** Channel links appended to YouTube and Facebook descriptions. */
export function linksBlock(links: Partial<Links>): string {
  const lines: string[] = [];
  if (links.youtube) lines.push('▶ YouTube: ' + links.youtube);
  if (links.instagram) lines.push('📸 Instagram: ' + links.instagram);
  if (links.facebook) lines.push('👍 Facebook: ' + links.facebook);
  if (links.tiktok) lines.push('🎵 TikTok: ' + links.tiktok);
  return lines.join('\n');
}

export function withLinksAndTags(body: string, hashtags: string[], links: Partial<Links>): string {
  return [body.trim(), linksBlock(links), hashtags.join(' ')].filter(Boolean).join('\n\n');
}
