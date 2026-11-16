import 'server-only';
import type { VideoBrief } from './seo';

// The SEO request for Claude. Claude runs on the owner's laptop through Claude Code, signed in with the
// owner's Claude account (scripts/claude-helper.mjs): it looks at frames from the video, searches the web
// for current kids' cartoon search terms, and answers in a fixed JSON shape that normaliseSeo() checks.

const SEO_SHAPE = JSON.stringify({
  youtube: { title: '', description: '', tags: [''], hashtags: [''], thumbText: '', playlist: '' },
  facebook: { title: '', description: '', hashtags: [''], pinned: '' },
  instagram: { caption: '', hashtags: [''], pinned: '', coverText: '' },
  tiktok: { caption: '', hashtags: [''] },
}, null, 2);

export type SeoInput = VideoBrief & {
  durationSec: number | null;
  channel: string;
  niche: string;
  frames: number; // how many frame-N.jpg files the helper saves
};

/** The request for Claude. The helper on the laptop saves the frames as frame-1.jpg … next to it. */
export function seoPrompt(v: SeoInput): string {
  const len = v.durationSec ? `${Math.floor(v.durationSec / 60)}:${String(Math.round(v.durationSec % 60)).padStart(2, '0')}` : 'unknown';
  return `You write search and discovery text (SEO) for one video on a kids' cartoon channel. It will be posted on YouTube, Facebook, Instagram Reels and TikTok. The goal is more views and more subscribers.

Channel name: ${v.channel || 'not given'}
Channel niche: ${v.niche || 'kids cartoons'}
Audience: children and their parents, mainly in Pakistan and India, plus Urdu and Hindi speakers worldwide.
Video name: ${v.name}
Creator's note about the story: ${v.note || 'none'}
Length: ${len} (minutes:seconds). Shape: ${v.shape === 'vertical' ? 'vertical 9:16 short' : 'horizontal 16:9'}.
${v.frames ? `The files ${Array.from({ length: v.frames }, (_, i) => `frame-${i + 1}.jpg`).join(', ')} in this folder are frames taken from across the video, in order. Read them first, and use what you see (characters, places, events) in the text.` : 'No frames are available; work from the name and note.'}

First, use web search (two or three searches are enough) to find search words and hashtags that are popular right now for kids' cartoons in Urdu, Hindi and English, and titles that do well in this niche. Then write the text.

Language rules:
- Titles mix Roman Urdu and English, for example "Leo ka Jadui Chiragh | Leo and the Magic Lamp | Urdu Cartoon for Kids".
- Descriptions and captions: the first two lines are a hook in Roman Urdu and English that makes a parent want to press play. Then a short summary. End with one line in Urdu script.
- Family safe. No false promises in titles. No links: the studio adds the channel links itself.

Limits:
- YouTube title at most 100 characters. YouTube tags: 15 to 25 tags, under 450 characters in total. YouTube hashtags: exactly 3.
- Facebook hashtags: 3 to 5. Instagram hashtags: 20 to 30. TikTok hashtags: 3 to 5. Every hashtag starts with # and has no spaces.
- Captions and descriptions under 2000 characters.
- thumbText and coverText: at most 4 big words.
- playlist: a short playlist name this video belongs in.
- facebook.pinned and instagram.pinned: a friendly first comment that invites parents and kids to comment. YouTube turns comments off on kids' videos, so YouTube has none.

Answer with only one JSON object, no other text, in exactly this shape (every field is a string or a list of strings):
${SEO_SHAPE}`;
}
