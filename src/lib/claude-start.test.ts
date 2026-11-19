import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startClaude } from './claude-start';

describe('starting Claude on GitHub', () => {
  beforeEach(() => {
    process.env.GITHUB_ACTIONS_TOKEN = 'test-token';
    process.env.GITHUB_REPO = 'owner/studio';
    (globalThis as { __reachClaudeStart?: number }).__reachClaudeStart = undefined;
  });
  afterEach(() => { delete process.env.GITHUB_ACTIONS_TOKEN; delete process.env.GITHUB_REPO; });

  it('starts the claude-seo workflow on main', async () => {
    const send = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await startClaude(1_000, send)).toBe('started');
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/owner/studio/actions/workflows/claude-seo.yml/dispatches');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'main' });
  });

  it('does nothing without a token', async () => {
    delete process.env.GITHUB_ACTIONS_TOKEN;
    const send = vi.fn();
    expect(await startClaude(1_000, send)).toBe('off');
    expect(send).not.toHaveBeenCalled();
  });

  it('takes the repository from Vercel when it is not set', async () => {
    delete process.env.GITHUB_REPO;
    process.env.VERCEL_GIT_REPO_OWNER = 'me';
    process.env.VERCEL_GIT_REPO_SLUG = 'reach';
    const send = vi.fn(async () => new Response(null, { status: 204 }));
    await startClaude(1_000, send);
    expect((send.mock.calls[0] as unknown as [string])[0]).toContain('/repos/me/reach/');
    delete process.env.VERCEL_GIT_REPO_OWNER;
    delete process.env.VERCEL_GIT_REPO_SLUG;
  });

  it('starts once a minute, but tries again at once after a failure', async () => {
    const ok = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await startClaude(1_000, ok)).toBe('started');
    expect(await startClaude(30_000, ok)).toBe('recent');
    expect(await startClaude(62_000, ok)).toBe('started');

    const bad = vi.fn(async () => new Response('Bad credentials', { status: 401 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await startClaude(200_000, bad)).toBe('failed');
    expect(await startClaude(201_000, ok)).toBe('started');
  });
});
