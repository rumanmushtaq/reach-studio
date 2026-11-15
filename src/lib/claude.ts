import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';
import { normaliseSeo, type Seo, type VideoBrief } from './seo';

// Writes the SEO pack with Claude: looks at frames from the video, searches the web for current
// kids' cartoon search terms, and answers in a fixed JSON shape.

const MODEL = 'claude-opus-5-5';

const list = { type: 'array', items: { type: 'string' } } as const;
const obj = (props: Record<string, unknown>) =>
  ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false }) as const;
const s = { type: 'string' } as const;

const SEO_JSON_SCHEMA = obj({
  youtube: obj({ title: s, description: s, tags: list, hashtags: list, thumbText: s, playlist: s }),
  facebook: obj({ title: s, description: s, hashtags: list, pinned: s }),
  instagram: obj({ caption: s, hashtags: list, pinned: s, coverText: s }),
  tiktok: obj({ caption: s, hashtags: list }),
});

export type SeoInput = VideoBrief & {
  durationSec: number | null;
  channel: string;
  niche: string;
  frames: Buffer[]; // JPEG
};

function prompt(v: SeoInput): string {
  const len = v.durationSec ? `${Math.floor(v.durationSec / 60)}:${String(Math.round(v.durationSec % 60)).padStart(2, '0')}` : 'unknown';
  return `You write search and discovery text (SEO) for one video on a kids' cartoon channel. It will be posted on YouTube, Facebook, Instagram Reels and TikTok. The goal is more views and more subscribers.

Channel name: ${v.channel || 'not given'}
Channel niche: ${v.niche || 'kids cartoons'}
Audience: children and their parents, mainly in Pakistan and India, plus Urdu and Hindi speakers worldwide.
Video name: ${v.name}
Creator's note about the story: ${v.note || 'none'}
Length: ${len} (minutes:seconds). Shape: ${v.shape === 'vertical' ? 'vertical 9:16 short' : 'horizontal 16:9'}.
${v.frames.length ? `The ${v.frames.length} images are frames taken from across the video, in order. Use what you see (characters, places, events) in the text.` : 'No frames are available; work from the name and note.'}

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
- facebook.pinned and instagram.pinned: a friendly first comment that invites parents and kids to comment. YouTube turns comments off on kids' videos, so YouTube has none.`;
}

export class SeoUnavailable extends Error {}

export async function writeSeoWithClaude(v: SeoInput): Promise<Seo> {
  if (!env.ANTHROPIC_API_KEY) throw new SeoUnavailable('ANTHROPIC_API_KEY is not set, so the studio wrote a basic draft.');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 240_000 });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...v.frames.map((f): Anthropic.Beta.BetaContentBlockParam => ({
      type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.toString('base64') },
    })),
    { type: 'text', text: prompt(v) },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content }];

  // Web search runs on Anthropic's side; a long search loop can pause the turn, so resume it a few times.
  for (let round = 0; round < 4; round++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SEO_JSON_SCHEMA } },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
      messages,
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);

    if (res.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
      continue;
    }
    if (res.stop_reason === 'refusal') throw new SeoUnavailable('Claude declined to write SEO for this video.');
    if (res.stop_reason === 'max_tokens') throw new SeoUnavailable('Claude ran out of room. Press Write with Claude to try again.');
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new SeoUnavailable('Claude’s answer could not be read. Press Write with Claude to try again.');
    }
    return normaliseSeo(parsed, v);
  }
  throw new SeoUnavailable('Claude took too long. Press Write with Claude to try again.');
}

export function seoErrorMessage(err: unknown): string {
  if (err instanceof SeoUnavailable) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return 'The Claude API key was rejected. Check ANTHROPIC_API_KEY.';
  if (err instanceof Anthropic.RateLimitError) return 'Claude is busy right now. Press Write with Claude in a few minutes.';
  if (err instanceof Anthropic.APIConnectionError) return 'Claude could not be reached. Press Write with Claude to try again.';
  if (err instanceof Anthropic.APIError) return `Claude returned an error (${err.status}). Press Write with Claude to try again.`;
  return 'Claude could not write the SEO. Press Write with Claude to try again.';
}
