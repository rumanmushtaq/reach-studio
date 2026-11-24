'use client';

import { useEffect, useState } from 'react';
import { CopyLine } from './ClaudeCard';

// How to install the TikTok helper extension (extensions/tiktok-helper), and whether this browser has it.
export function TikTokHelperCard() {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const check = () => setInstalled(document.documentElement.dataset.reachTiktok === '1');
    check();
    const t = setTimeout(check, 1000);
    return () => clearTimeout(t);
  }, []);
  return (
    <section className="card claude-card" id="tiktok-helper" aria-labelledby="tiktok-helper-h">
      <div className="row-between">
        <h2 id="tiktok-helper-h">TikTok helper</h2>
        <span className={`pill ${installed ? 'ok' : ''}`}>{installed ? 'Installed in this browser' : 'Not installed'}</span>
      </div>
      <p className="small muted">
        Free TikTok posting. On a video page press <b>Post to TikTok</b>: the helper opens TikTok, adds the video and
        Claude&apos;s caption, and you press <b>Post</b>. It never posts by itself, so TikTok sees you posting.
      </p>
      <ol className="claude-steps">
        <li>
          <b>Download the helper and unzip it</b>
          <span className="small muted">Right-click the downloaded file and choose <b>Extract here</b>. You get a folder called <code>reach-tiktok-helper</code>; keep it, Chrome uses it from there.</span>
          <a className="btn sm" href="/api/tiktok-helper" download style={{ alignSelf: 'flex-start' }}>Download TikTok helper (.zip)</a>
        </li>
        <li>
          <b>Open Chrome&apos;s extensions page</b>
          <span className="small muted">Type this in the address bar, then turn on <b>Developer mode</b> (top right).</span>
          <CopyLine text="chrome://extensions" />
        </li>
        <li>
          <b>Load the helper</b>
          <span className="small muted">Press <b>Load unpacked</b> and choose the <code>reach-tiktok-helper</code> folder from step 1.</span>
        </li>
        <li>
          <b>Sign in to TikTok in the same browser</b>
          <span className="small muted">Then reload this page: the label above says Installed.</span>
        </li>
      </ol>
    </section>
  );
}
