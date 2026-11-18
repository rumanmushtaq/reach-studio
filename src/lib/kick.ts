import 'server-only';
import { after } from 'next/server';
import { tick } from './services';
import type { StudioData } from './view';

// The job runner is called every 15 minutes from outside (cron-job.org or GitHub Actions). As a backup,
// opening the studio also runs work that is due, after the page is sent, at most once a minute per server.
const EVERY = 60_000;

/** Posts due now (or SEO stuck) that the job runner has not picked up. */
export function dueWork(d: Pick<StudioData, 'posts' | 'videos' | 'now'>) {
  const posts = d.posts.filter((p) => p.state === 'waiting' && p.runAt <= d.now && !(p.lockedUntil && p.lockedUntil > d.now));
  return { posts, late: posts.filter((p) => p.runAt < d.now - 20 * 60_000) };
}

export function kickJobs(d: Pick<StudioData, 'posts' | 'videos' | 'now'>) {
  if (!dueWork(d).posts.length) return;
  const g = globalThis as unknown as { __reachKick?: number };
  if (g.__reachKick && d.now - g.__reachKick < EVERY) return;
  g.__reachKick = d.now;
  after(async () => {
    try { await tick(200_000); } catch (e) { console.error('Background job run failed:', e); }
  });
}
