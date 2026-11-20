// Looks at the whole video before Claude writes its SEO: frames from start to end, what is said in it
// (speech to text), and what people type into YouTube search for related phrases. Every part is optional:
// without ffmpeg, Python or the internet, Claude still gets what could be prepared.

import { spawn } from 'node:child_process';
import { readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIBE_LIMIT_SEC = 15 * 60; // longer videos: only the first 15 minutes are transcribed

/** Runs a program; resolves with its output, rejects with the last lines of its errors. */
export function run(cmd, args, { timeoutMs = 10 * 60_000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${cmd} took too long`)); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim().split('\n').slice(-3).join(' ').slice(0, 300) || `${cmd} exited with ${code}`));
    });
  });
}

/** How many frames to take: about one every 4 seconds, at least 8 and at most 24, spread evenly. */
export function framePlan(durationSec) {
  const d = durationSec && durationSec > 0 ? durationSec : 60;
  const count = Math.min(24, Math.max(8, Math.round(d / 4)));
  return { count, at: Array.from({ length: count }, (_, i) => ((i + 0.5) * d) / count) };
}

export const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Saves frames from across the whole video as frame-01.jpg …; returns their names and times. */
export async function extractFrames(video, dir, durationSec) {
  const { count, at } = framePlan(durationSec);
  const d = durationSec && durationSec > 0 ? durationSec : 60;
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', video, '-vf', `fps=${count}/${d},scale=640:-2`, '-frames:v', String(count), '-q:v', '4', path.join(dir, 'frame-%02d.jpg')]);
  const files = (await readdir(dir)).filter((f) => /^frame-\d+\.jpg$/.test(f)).sort();
  return files.map((file, i) => ({ file, at: at[i] ?? at[at.length - 1] }));
}

/** What is said in the video, as "[m:ss] text" lines; null when there is no speech or no Whisper. */
export async function transcribe(video, dir, python = process.env.HELPER_PYTHON || 'python3') {
  const wav = path.join(dir, 'audio.wav');
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-t', String(TRANSCRIBE_LIMIT_SEC), wav]);
  const text = (await run(python, [path.join(SCRIPTS, 'transcribe.py'), wav], { timeoutMs: 20 * 60_000 })).trim();
  return text || null;
}

/** Search phrases to look up in YouTube's suggestions: the video's name without part numbers, and the niche. */
export function seedsFor({ name, niche, channel }) {
  const clean = (s) => String(s ?? '').replace(/[_|-]+/g, ' ')
    .replace(/\b(ep(isode)?|part|pt|season|s)\s*\d+\b/gi, ' ').replace(/\b\d+\s*s(ec)?\b/gi, ' ')
    .replace(/\b(partial|final|v\d+)\b/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const title = clean(name);
  const words = title.split(' ').filter(Boolean);
  const seeds = [title, words.slice(0, 2).join(' '), words[0], clean(niche), clean(channel), 'urdu cartoon', 'kids cartoon urdu'];
  return [...new Set(seeds.filter((s) => s && s.length > 2))].slice(0, 8);
}

/** What people type into YouTube search, starting with each seed. Seeds that fail are skipped. */
export async function youtubeSuggestions(seeds, send = fetch) {
  const found = [];
  for (const q of seeds) {
    try {
      const res = await send(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`);
      if (!res.ok) continue;
      const [, list] = await res.json();
      if (Array.isArray(list)) found.push(...list.filter((s) => typeof s === 'string'));
    } catch { /* offline or blocked: Claude can still search itself */ }
  }
  return [...new Set(found)];
}

/** The part of Claude's request that lists what was prepared in its folder. */
export function filesSection({ frames, transcript, suggestions, durationSec }) {
  const lines = ['Files prepared from the video, in this folder. Read every frame before you write.'];
  if (frames.length) {
    const whole = frames.length > 4;
    lines.push(`- ${frames[0].file} … ${frames[frames.length - 1].file}: ${frames.length} frames ${whole ? 'from the start to the end of the video' : 'from the video'}, in order, taken at ${frames.map((f) => clock(f.at)).join(', ')}${durationSec ? ` of ${clock(durationSec)}` : ''}. Use what you see: characters, places, objects, actions, words on screen, how the story goes.`);
  } else {
    lines.push('- No frames could be taken. Work from the name and the note.');
  }
  if (transcript) {
    lines.push('- transcript.txt: what is said in the video, written out by speech recognition, with times. It may have wrong words, especially names and Urdu. Use it to understand the story and the words viewers will search; never copy its mistakes.');
  }
  if (suggestions.length) {
    lines.push('- youtube-searches.txt: what people type into YouTube search for phrases related to this video, from YouTube\'s own search suggestions.');
  }
  lines.push('You can check more phrases the same way: web fetch https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=<phrase> returns what people type into YouTube search starting with that phrase.');
  return lines.join('\n');
}

/** Prepares the folder for one job: downloads the video, takes frames, writes out speech and searches. */
export async function prepare(job, dir, log = () => {}) {
  let frames = [];
  let transcript = null;
  let video = null;
  if (job.video) {
    try {
      const res = await fetch(job.video);
      if (!res.ok) throw new Error(`download answered ${res.status}`);
      video = path.join(dir, 'video');
      await writeFile(video, Buffer.from(await res.arrayBuffer()));
    } catch (e) { log(`  Could not download the video: ${e.message}`); video = null; }
  }
  if (video) {
    try { frames = await extractFrames(video, dir, job.durationSec); log(`  ${frames.length} frames from the whole video`); }
    catch (e) { log(`  Could not take frames (${e.code === 'ENOENT' ? 'ffmpeg is not installed' : e.message})`); }
    if (process.env.HELPER_TRANSCRIBE !== 'off') {
      try {
        transcript = await transcribe(video, dir);
        if (transcript) await writeFile(path.join(dir, 'transcript.txt'), `${transcript}\n`);
        log(transcript ? `  Speech written out (${transcript.split('\n').length} lines)` : '  No speech found');
      } catch (e) { log(`  No speech to text (${e.code === 'ENOENT' ? 'Python or ffmpeg is not installed' : e.message})`); }
    }
  }
  if (!frames.length) {
    // The few frames the browser took when the video was added.
    for (const [i, url] of (job.frames ?? []).entries()) {
      const res = await fetch(url).catch(() => null);
      if (!res?.ok) continue;
      const file = `frame-${String(i + 1).padStart(2, '0')}.jpg`;
      await writeFile(path.join(dir, file), Buffer.from(await res.arrayBuffer()));
      frames.push({ file, at: job.durationSec ? ((i + 1) * job.durationSec) / ((job.frames?.length ?? 0) + 1) : 0 });
    }
  }
  const suggestions = await youtubeSuggestions(seedsFor(job));
  if (suggestions.length) await writeFile(path.join(dir, 'youtube-searches.txt'), `${suggestions.join('\n')}\n`);
  log(`  ${suggestions.length} YouTube search suggestions`);
  if (video) await rm(video, { force: true }); // free the space; Claude reads the frames, not the file
  return filesSection({ frames, transcript, suggestions, durationSec: job.durationSec });
}
