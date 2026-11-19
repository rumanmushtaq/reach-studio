'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

// Claude writes the SEO through Claude Code signed in with the owner's Claude plan (no API key): on GitHub
// Actions every 15 minutes, or on a laptop. This card says whether that helper checks in and how to set it up.

export function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false); // feedback only
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the text is still selectable */ }
  };
  return (
    <span className="copyline">
      <code>{text}</code>
      <button type="button" onClick={copy} aria-label={`Copy ${text}`} title="Copy">
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      </button>
    </span>
  );
}

function ago(ms: number) {
  const min = Math.round(ms / 60_000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
}

export function ClaudeCard({ seenAt, now }: { seenAt: number | null; now: number }) {
  // GitHub runs the helper every 15 minutes and may start a few minutes late.
  const running = !!seenAt && now - seenAt < 25 * 60_000;
  const [origin, setOrigin] = useState('https://your-studio.vercel.app');
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <section className="card claude-card" aria-labelledby="claude">
      <div className="row-between">
        <h2 id="claude">Claude</h2>
        <span className={`pill ${running ? 'ok' : ''}`}>{running ? 'Running' : 'Not running'}</span>
      </div>
      <p className="small muted">
        Claude writes titles, descriptions and tags with <b>Claude Code</b>, signed in with your Claude Pro or Max
        plan. There is no API key. GitHub runs it for you every 15 minutes, so no computer has to stay on.
        {seenAt ? ` Last check-in ${ago(now - seenAt)}.` : ' It has not checked in yet.'}
      </p>
      <ol className="claude-steps">
        <li>
          <b>Make a Claude token on your computer</b>
          <span className="small muted">Install Claude Code once, then run the second line. It opens your Claude sign-in and prints a long token. Copy it.</span>
          <CopyLine text="npm install -g @anthropic-ai/claude-code" />
          <CopyLine text="claude setup-token" />
        </li>
        <li>
          <b>Add three secrets on GitHub</b>
          <span className="small muted">In your GitHub repository open <b>Settings → Secrets and variables → Actions → New repository secret</b>. Add each name below with its value. The last two are the <code>CRON_SECRET</code> from Vercel and the token from step 1.</span>
          <CopyLine text="STUDIO_URL" />
          <CopyLine text={origin} />
          <CopyLine text="CRON_SECRET" />
          <CopyLine text="CLAUDE_CODE_OAUTH_TOKEN" />
        </li>
        <li>
          <b>Let the studio start Claude right after an upload</b>
          <span className="small muted">GitHub runs the 15-minute schedule late, sometimes hours late. In GitHub open <b>Settings → Developer settings → Fine-grained tokens → Generate new token</b>, choose only this repository and give it <b>Actions: Read and write</b>. Add it in Vercel as the environment variable below, then redeploy.</span>
          <CopyLine text="GITHUB_ACTIONS_TOKEN" />
        </li>
        <li>
          <b>Run it once to check</b>
          <span className="small muted">Open <b>Actions → claude-seo → Run workflow</b>. A green tick means it works, and this card shows Running. After that it runs by itself. While it is off, videos still post with a basic SEO draft.</span>
        </li>
      </ol>
      <details className="small muted">
        <summary>Or run it on your laptop instead</summary>
        <span>Add <code>HELPER_STUDIO_URL={origin}</code> and <code>HELPER_SECRET=</code> with your Vercel <code>CRON_SECRET</code> to <code>.env.local</code>, sign in with <code>claude</code>, then leave <code>npm run claude-helper</code> open.</span>
      </details>
    </section>
  );
}
