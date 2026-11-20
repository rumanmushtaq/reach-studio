#!/usr/bin/env node
// Claude helper: writes each video's SEO with Claude Code, signed in with your own Claude account,
// so the studio needs no Claude API key. Two ways to run it:
//   - GitHub Actions (.github/workflows/claude-seo.yml) runs `--once` every 15 minutes with a token from
//     `claude setup-token`, so no computer has to stay on.
//   - On a laptop: `npm run claude-helper`, left open.
//
// `--once`: do every waiting video, then exit (non-zero when the studio cannot be reached or a video failed).
//
// It asks the studio for videos waiting for Claude about once a minute, prepares a temporary folder with
// frames from the whole video, what is said in it and YouTube search suggestions (video-analysis.mjs),
// runs `claude -p` there (it may only read files, search the web and read web pages to research the
// market), and sends the answer back. Until it does, videos use the studio's basic SEO draft.
// Speech to text needs ffmpeg and Python with scripts/requirements-transcribe.txt; HELPER_PYTHON picks
// the Python, HELPER_TRANSCRIBE=off skips it.
//
// Settings (from .env.local or the environment):
//   HELPER_STUDIO_URL  the studio address, e.g. https://reach-studio.vercel.app (default: APP_URL)
//   HELPER_SECRET      the studio's CRON_SECRET (default: CRON_SECRET)

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepare } from './video-analysis.mjs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const STUDIO = (process.env.HELPER_STUDIO_URL || process.env.APP_URL || '').replace(/\/$/, '');
const SECRET = process.env.HELPER_SECRET || process.env.CRON_SECRET || '';
const EVERY_MS = 60_000;
const ONCE = process.argv.includes('--once');
const ONCE_BUDGET_MS = 40 * 60_000; // a run stops taking new videos after this; the next run continues
const CLAUDE_TIMEOUT_MS = 10 * 60_000;

if (!STUDIO || !SECRET) {
  console.error('Set HELPER_STUDIO_URL and HELPER_SECRET (your studio address and its CRON_SECRET) in .env.local.');
  process.exit(1);
}

const str = { type: 'string' };
const list = { type: 'array', items: str };
const obj = (props) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
const SCHEMA = JSON.stringify(obj({
  youtube: obj({ title: str, description: str, tags: list, hashtags: list, thumbText: str, playlist: str }),
  facebook: obj({ title: str, description: str, hashtags: list, pinned: str }),
  instagram: obj({ caption: str, hashtags: list, pinned: str, coverText: str }),
  tiktok: obj({ caption: str, hashtags: list }),
  research: obj({ searchTerms: list, hashtags: list, channels: list, notes: str }),
}));

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

async function studio(pathname, init = {}) {
  const res = await fetch(`${STUDIO}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 401) throw new Error('The studio refused the secret. HELPER_SECRET must match its CRON_SECRET.');
  if (!res.ok) throw new Error(`The studio answered ${res.status}`);
  return res.json();
}

/** Runs Claude Code in print mode in `dir`, with the prompt on stdin. Resolves with its JSON output. */
function runClaude(prompt, dir) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--json-schema', SCHEMA, '--no-session-persistence', '--allowedTools', 'Read WebSearch WebFetch'];
    const child = spawn('claude', args, { cwd: dir, shell: process.platform === 'win32', windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Claude took longer than 10 minutes')); }, CLAUDE_TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e.code === 'ENOENT' ? new Error('Claude Code is not installed. Install it and sign in with `claude` once.') : e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        // On failure Claude Code still prints its JSON result; its `result` says why (e.g. an expired sign-in).
        const why = (() => { try { return JSON.parse(out).result; } catch { return undefined; } })();
        return reject(new Error(String(why || err || out).trim().slice(0, 300) || `claude exited with ${code}`));
      }
      try { resolve(JSON.parse(out)); } catch { reject(new Error('Claude Code gave output that is not JSON')); }
    });
    child.stdin.end(prompt);
  });
}

/** The SEO object from Claude Code's JSON output: the structured answer, or JSON inside the text. */
function seoFrom(output) {
  if (output.is_error) throw new Error(String(output.result ?? 'Claude reported an error').slice(0, 300));
  if (output.structured_output && typeof output.structured_output === 'object') return output.structured_output;
  const text = String(output.result ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Claude did not answer with JSON');
  return JSON.parse(text.slice(start, end + 1));
}

async function work(job) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reach-claude-'));
  try {
    log(`Looking at "${job.name}"…`);
    const files = await prepare(job, dir, log);
    log(`Writing SEO for "${job.name}"…`);
    const seo = seoFrom(await runClaude(`${job.prompt}\n\n${files}`, dir));
    const { result } = await studio(`/api/helper/jobs/${job.id}`, { method: 'POST', body: JSON.stringify({ seo }) });
    log(result === 'saved' ? `Done: "${job.name}"` : `Not used for "${job.name}" (posting had started, or you edited it)`);
    return true;
  } catch (e) {
    log(`Failed for "${job.name}": ${e.message}`);
    await studio(`/api/helper/jobs/${job.id}`, { method: 'POST', body: JSON.stringify({ error: e.message }) }).catch(() => undefined);
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (ONCE) {
  log(`Claude helper for ${STUDIO}, one run.`);
  const started = Date.now();
  let done = 0;
  let failed = 0;
  try {
    // The studio hands out two videos at a time; ask again until none are left.
    while (Date.now() - started < ONCE_BUDGET_MS) {
      const { jobs } = await studio('/api/helper/jobs');
      if (!jobs.length) break;
      for (const job of jobs) { if (await work(job)) done++; else failed++; }
    }
  } catch (e) {
    log(e.message);
    process.exit(1);
  }
  if (!done && !failed) log('No videos are waiting for Claude.');
  else log(`Wrote ${done}, failed ${failed}.`);
  process.exit(failed ? 1 : 0); // a red run on GitHub, so a failure is seen
}

log(`Claude helper for ${STUDIO}. Leave this window open; press Ctrl+C to stop.`);
for (;;) {
  try {
    const { jobs } = await studio('/api/helper/jobs');
    for (const job of jobs) await work(job);
  } catch (e) {
    log(e.message);
  }
  await new Promise((r) => setTimeout(r, EVERY_MS));
}
