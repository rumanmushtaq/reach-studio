import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFrames, filesSection, framePlan, seedsFor, youtubeSuggestions } from './video-analysis.mjs';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe('looking at the whole video', () => {
  it('takes a frame about every 4 seconds, 8 to 24 frames, spread over the whole video', () => {
    expect(framePlan(60).count).toBe(15);
    expect(framePlan(10).count).toBe(8);
    expect(framePlan(600).count).toBe(24);
    const { at } = framePlan(60);
    expect(at[0]).toBeCloseTo(2);
    expect(at.at(-1)).toBeCloseTo(58);
  });

  it.skipIf(!hasFfmpeg)('saves the frames from start to end', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reach-frames-'));
    const video = path.join(dir, 'clip.mp4');
    spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=40:size=320x240:rate=10', video]);
    const frames = await extractFrames(video, dir, 40);
    expect(frames).toHaveLength(10);
    expect(frames[0]).toEqual({ file: 'frame-01.jpg', at: 2 });
    expect((await readdir(dir)).filter((f) => f.endsWith('.jpg'))).toHaveLength(10);
  });

  it('searches YouTube for the story, not for part numbers', () => {
    expect(seedsFor({ name: 'Gholu_Science_Ep2_Part9_60s', niche: 'Urdu cartoons for kids', channel: 'DailyClipViralMoment' }))
      .toEqual(['gholu science', 'gholu', 'urdu cartoons for kids', 'dailyclipviralmoment', 'urdu cartoon', 'kids cartoon urdu']);
  });

  it('collects what people type into YouTube search, and skips a search that fails', async () => {
    const send = async (url) => (url.includes('q=bad')
      ? new Response('no', { status: 429 })
      : Response.json(['gholu', ['gholu', 'gholu science', 'golu molu'], []]));
    expect(await youtubeSuggestions(['gholu', 'bad', 'gholu science'], send)).toEqual(['gholu', 'gholu science', 'golu molu']);
  });

  it('tells Claude what is in its folder', () => {
    const text = filesSection({
      frames: [{ file: 'frame-01.jpg', at: 2 }, { file: 'frame-02.jpg', at: 6 }],
      transcript: '[0:01] Gholu: rocket!', suggestions: ['gholu science'], durationSec: 60,
    });
    expect(text).toContain('frame-01.jpg … frame-02.jpg: 2 frames from the video, in order, taken at 0:02, 0:06 of 1:00');
    expect(text).toContain('transcript.txt');
    expect(text).toContain('youtube-searches.txt');
    expect(filesSection({ frames: [], transcript: null, suggestions: [], durationSec: null })).toContain('No frames could be taken');
  });
});
