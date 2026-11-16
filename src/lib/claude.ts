import 'server-only';
import type { VideoBrief } from './seo';

// The SEO request for Claude. Claude runs on the owner's laptop through Claude Code, signed in with the
// owner's Claude account (scripts/claude-helper.mjs): it looks at frames from the video, researches the
// market on the web (what people search, what is trending, what top channels do), and answers in a fixed
// JSON shape that normaliseSeo() and ResearchSchema check.

const SEO_SHAPE = JSON.stringify({
  youtube: { title: '', description: '', tags: [''], hashtags: [''], thumbText: '', playlist: '' },
  facebook: { title: '', description: '', hashtags: [''], pinned: '' },
  instagram: { caption: '', hashtags: [''], pinned: '', coverText: '' },
  tiktok: { caption: '', hashtags: [''] },
  research: { searchTerms: [''], hashtags: [''], channels: [''], notes: '' },
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

Step 1: research the market before writing. Use web search, and web fetch to read pages, about 5 to 8 times:
- What parents and kids search for right now for this kind of story, in Urdu, Hindi and English (YouTube and Google search suggestions, Google Trends).
- The top kids' cartoon channels in this niche (Urdu and Hindi moral stories, rhymes, animated stories): the titles of their most viewed recent videos, and the tags and hashtags they use.
- Hashtags trending right now on YouTube Shorts, TikTok and Instagram Reels for kids' cartoons and for this story's topic.
- Any season, festival, holiday or event in Pakistan and India in the next two weeks that fits the story.
Use only real, current terms you found. Prefer phrases many people search where the top results are weak or old. Do not copy another channel's titles.

Step 2: write the text. Put the strongest search phrase near the start of the YouTube title and in the first line of every description and caption. Use the trending hashtags that fit the story, mixed with a few broad ones (#kidscartoon, #urducartoon).

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
- research: what you found. searchTerms: up to 15 phrases people search right now, strongest first. hashtags: up to 20 trending hashtags. channels: the channels you compared with. notes: 2 to 4 sentences on what works in this niche right now and why you chose this title.

Answer with only one JSON object, no other text, in exactly this shape (every field is a string or a list of strings):
${SEO_SHAPE}`;
}
