'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

// Claude writes the SEO through Claude Code on the owner's laptop (their Claude plan, no API key).
// This card says whether that helper is running and how to start it.

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
  const running = !!seenAt && now - seenAt < 5 * 60_000;
  const [origin, setOrigin] = useState('https://your-studio.vercel.app');
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <section className="card claude-card" aria-labelledby="claude">
      <div className="row-between">
        <h2 id="claude">Claude</h2>
        <span className={`pill ${running ? 'ok' : ''}`}>{running ? 'Running' : 'Not running'}</span>
      </div>
      <p className="small muted">
        Claude writes titles, descriptions and tags through <b>Claude Code on your laptop</b>, signed in with your
        Claude Pro or Max plan. There is no API key to add here.
        {seenAt ? ` Last check-in ${ago(now - seenAt)}.` : ' It has not checked in yet.'}
      </p>
      <ol className="claude-steps">
        <li>
          <b>Install Claude Code and sign in</b>
          <span className="small muted">Install it once, then run <code>claude</code> and sign in with your Claude account.</span>
          <CopyLine text="npm install -g @anthropic-ai/claude-code" />
          <CopyLine text="claude" />
        </li>
        <li>
          <b>Point it at this studio</b>
          <span className="small muted">Add these two lines to <code>.env.local</code> in the project folder. The secret is the <code>CRON_SECRET</code> you set in Vercel.</span>
          <CopyLine text={`HELPER_STUDIO_URL=${origin}`} />
          <CopyLine text="HELPER_SECRET=your-CRON_SECRET" />
        </li>
        <li>
          <b>Start the helper and leave it open</b>
          <span className="small muted">It checks for new videos every minute. While it is off, videos still post with a basic SEO draft.</span>
          <CopyLine text="npm run claude-helper" />
        </li>
      </ol>
    </section>
  );
}
