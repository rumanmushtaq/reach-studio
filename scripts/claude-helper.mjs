#!/usr/bin/env node
// Claude helper: writes each video's SEO with Claude Code, signed in with your own Claude account,
// so the studio needs no Claude API key. Leave it running on your laptop: `npm run claude-helper`.
//
// It asks the studio for videos waiting for Claude about once a minute, saves their frames to a
// temporary folder, runs `claude -p` there (it may only read files and search the web), and sends
// the answer back. Until it does, videos use the studio's basic SEO draft.
//
// Settings (from .env.local or the environment):
//   HELPER_STUDIO_URL  the studio address, e.g. https://reach-studio.vercel.app (default: APP_URL)
//   HELPER_SECRET      the studio's CRON_SECRET (default: CRON_SECRET)

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const STUDIO = (process.env.HELPER_STUDIO_URL || process.env.APP_URL || '').replace(/\/$/, '');
const SECRET = process.env.HELPER_SECRET || process.env.CRON_SECRET || '';
const EVERY_MS = 60_000;
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
    const args = ['-p', '--output-format', 'json', '--json-schema', SCHEMA, '--no-session-persistence', '--allowedTools', 'Read WebSearch'];
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
      if (code !== 0) return reject(new Error((err || out).trim().slice(0, 300) || `claude exited with ${code}`));
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
    for (const [i, url] of job.frames.entries()) {
      const res = await fetch(url);
      if (res.ok) await writeFile(path.join(dir, `frame-${i + 1}.jpg`), Buffer.from(await res.arrayBuffer()));
    }
    log(`Writing SEO for "${job.name}"…`);
    const seo = seoFrom(await runClaude(job.prompt, dir));
    const { result } = await studio(`/api/helper/jobs/${job.id}`, { method: 'POST', body: JSON.stringify({ seo }) });
    log(result === 'saved' ? `Done: "${job.name}"` : `Not used for "${job.name}" (posting had started, or you edited it)`);
  } catch (e) {
    log(`Failed for "${job.name}": ${e.message}`);
    await studio(`/api/helper/jobs/${job.id}`, { method: 'POST', body: JSON.stringify({ error: e.message }) }).catch(() => undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
