'use client';

import { useEffect, useState } from 'react';
import { CopyLine } from './ClaudeCard';

// Uploads and posts happen when the job runner is called. Vercel's free plan calls it once a day, so GitHub
// Actions (tick.yml) or a free cron-job.org job calls it every 15 minutes. This card says whether posts are late and how to set that up.

export function JobRunnerCard({ late }: { late: number }) {
  const [origin, setOrigin] = useState('https://your-studio.vercel.app');
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <section className="card claude-card" id="jobs" aria-labelledby="jobs-h">
      <div className="row-between">
        <h2 id="jobs-h">Job runner</h2>
        <span className={`pill ${late ? '' : 'ok'}`}>{late ? `${late} late` : 'On time'}</span>
      </div>
      <p className="small muted">
        The job runner uploads each video and posts it at its slot. Vercel&apos;s free plan only calls it once a day,
        so set up a free call every 15 minutes. Until then, the studio also runs due work whenever you open it.
      </p>
      <p className="small muted">
        <b>Added the GitHub secrets in the Claude card?</b> Then GitHub already calls it every 15 minutes (the
        <code> tick</code> workflow) and you can skip the steps below.
      </p>
      <ol className="claude-steps">
        <li>
          <b>Create a free account at cron-job.org</b>
          <span className="small muted">Then press <b>Create cronjob</b>.</span>
        </li>
        <li>
          <b>Paste this address</b>
          <span className="small muted">Schedule: <b>Every 15 minutes</b>.</span>
          <CopyLine text={`${origin}/api/cron/tick`} />
        </li>
        <li>
          <b>Add the secret header</b>
          <span className="small muted">Open <b>Advanced → Headers → Add</b>. Key <code>Authorization</code>, value as below with your Vercel <code>CRON_SECRET</code> in place of the last word. Save, then press <b>Test run</b>: it should say 200.</span>
          <CopyLine text="Authorization" />
          <CopyLine text="Bearer your-CRON_SECRET" />
        </li>
      </ol>
    </section>
  );
}
