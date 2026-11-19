import 'server-only';
import { env, has } from './env';

// GitHub runs scheduled workflows when it has room, sometimes hours late. So when a video needs Claude, the
// studio starts the claude-seo workflow itself. It needs GITHUB_ACTIONS_TOKEN; without it the schedule remains.
const GAP = 60_000; // one start a minute per server is enough: a run takes every waiting video

export type ClaudeStart = 'started' | 'off' | 'failed' | 'recent';

export async function startClaude(now = Date.now(), send: typeof fetch = fetch): Promise<ClaudeStart> {
  if (!has.claudeStart()) return 'off';
  const g = globalThis as unknown as { __reachClaudeStart?: number };
  if (g.__reachClaudeStart && now - g.__reachClaudeStart < GAP) return 'recent';
  g.__reachClaudeStart = now;
  const res = await send(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/claude-seo.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ ref: 'main' }),
  }).catch(() => null);
  if (res?.status === 204) return 'started';
  g.__reachClaudeStart = undefined; // let the next request try again
  console.error(`Could not start Claude on GitHub (${res ? `${res.status} ${(await res.text()).slice(0, 200)}` : 'no answer'})`);
  return 'failed';
}
