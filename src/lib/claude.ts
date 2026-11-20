import 'server-only';
import type { VideoBrief } from './seo';

// The SEO request for Claude. Claude runs through Claude Code, signed in with the owner's Claude account
// (scripts/claude-helper.mjs, on GitHub Actions or a laptop). The helper adds a list of the files it prepared
// from the whole video (frames, speech, YouTube searches). Claude researches the market on the web and
// answers in a fixed JSON shape that normaliseSeo() and ResearchSchema check.

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
};

/** The request for Claude. The helper appends the list of files it prepared from the video. */
export function seoPrompt(v: SeoInput): string {
  const len = v.durationSec ? `${Math.floor(v.durationSec / 60)}:${String(Math.round(v.durationSec % 60)).padStart(2, '0')}` : 'unknown';
  return `You write search and discovery text (SEO) for one video on a kids' cartoon channel. It will be posted on YouTube, Facebook, Instagram Reels and TikTok. The goal is more views and more subscribers.

Channel name: ${v.channel || 'not given'}
Channel niche: ${v.niche || 'kids cartoons'}
Audience: children and their parents, mainly in Pakistan and India, plus Urdu and Hindi speakers worldwide.
Video name: ${v.name}
Creator's note about the story: ${v.note || 'none'}
Length: ${len} (minutes:seconds). Shape: ${v.shape === 'vertical' ? 'vertical 9:16 short' : 'horizontal 16:9'}.
Files prepared from the video are listed at the end of this request.

Step 1: understand the video. Read every frame and, when there is one, the transcript. Work out who is in it, where it happens, what happens from start to end, and the words someone would type to find it. The title, description and tags must describe what really happens in this video.

Step 2: research the market before writing. Use web search, and web fetch to read pages, about 5 to 8 times:
- What parents and kids search for right now for this kind of story, in Urdu, Hindi and English. Start from youtube-searches.txt when it is there, and check your own phrase ideas with the YouTube search suggestions link at the end of this request.
- The top kids' cartoon channels in this niche (Urdu and Hindi moral stories, rhymes, animated stories): the titles of their most viewed recent videos, and the tags and hashtags they use.
- Hashtags trending right now on YouTube Shorts, TikTok and Instagram Reels for kids' cartoons and for this story's topic.
- Any season, festival, holiday or event in Pakistan and India in the next two weeks that fits the story.
Use only real, current terms you found. Prefer phrases many people search where the top results are weak or old. Do not copy another channel's titles.

Step 3: write the text. Put the strongest search phrase near the start of the YouTube title and in the first line of every description and caption. Use the trending hashtags that fit the story, mixed with a few broad ones (#kidscartoon, #urducartoon).

Language rules:
- Titles mix Roman Urdu and English, for example "Leo ka Jadui Chiragh | Leo and the Magic Lamp | Urdu Cartoon for Kids".
- Descriptions and captions: the first two lines are a hook in Roman Urdu and English that makes a parent want to press play. Then a short summary. End with one line in Urdu script.
- Family safe. No false promises in titles. No links: the studio adds the channel links itself.

Limits:
- YouTube title at most 100 characters. YouTube hashtags: exactly 3.
- YouTube tags: 15 to 25 tags, under 450 characters in total. Order them: first the exact main search phrase, then phrases about this story (characters, topic, what happens), then broader niche phrases. Mix Roman Urdu, English and two or three in Urdu script. Prefer phrases people really type into YouTube (from youtube-searches.txt or the suggestions link). Every tag must be true to the video: no other channels' names, no unrelated popular words, no misspelled copies of the same tag.
- Facebook hashtags: 3 to 5. Instagram hashtags: 20 to 30. TikTok hashtags: 3 to 5. Every hashtag starts with # and has no spaces.
- Captions and descriptions under 2000 characters.
- thumbText and coverText: at most 4 big words.
- playlist: a short playlist name this video belongs in.
- facebook.pinned and instagram.pinned: a friendly first comment that invites parents and kids to comment. YouTube turns comments off on kids' videos, so YouTube has none.
- research: what you found. searchTerms: up to 15 phrases people search right now, strongest first. hashtags: up to 20 trending hashtags. channels: the channels you compared with. notes: 2 to 4 sentences on what works in this niche right now and why you chose this title.

Answer with only one JSON object, no other text, in exactly this shape (every field is a string or a list of strings):
${SEO_SHAPE}`;
}
