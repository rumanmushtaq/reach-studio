'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { connectTikTok, disconnect } from '@/app/actions';
import { PLATFORM_NAMES, PLATFORMS, type Platform } from '@/lib/seo';
import { ConfirmButton, Icon, PlatformBadge, useToast } from './ui';

const NOTE: Record<Platform, string> = {
  youtube: 'Google sign-in. New Google API apps post private videos until Google approves the app, so apply for the audit in your first week.',
  facebook: 'Your Facebook Page. Videos upload early and Facebook publishes them at the slot.',
  instagram: 'A Business or Creator account linked to your Facebook Page. It connects with the Facebook sign-in.',
  tiktok: 'Through Upload-Post, because TikTok blocks public posts from apps it has not approved.',
};

export type SetupState = { claude: boolean; storage: boolean; google: boolean; meta: boolean; links: boolean };

export function AccountsView({ connected, setup, banner }: { connected: Record<Platform, string | null>; setup: SetupState; banner: { ok?: string; error?: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [key, setKey] = useState('');
  const [user, setUser] = useState('');

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    toast(r.ok ? r.message ?? 'Done' : r.error ?? 'Something went wrong');
    router.refresh();
  });

  const steps: [string, boolean, React.ReactNode][] = [
    ['Claude writes the SEO', setup.claude, 'Set ANTHROPIC_API_KEY (README step 3)'],
    ['Video storage', setup.storage, 'Set CLOUDINARY_URL (README step 2)'],
    ...PLATFORMS.map((p): [string, boolean, React.ReactNode] => [`${PLATFORM_NAMES[p]} connected`, !!connected[p], 'Connect it below']),
    ['Channel links for descriptions', setup.links, <Link key="l" href="/settings">Add in Settings</Link>],
  ];
  const done = steps.filter((s) => s[1]).length;

  const connectButton = (p: Platform) => {
    if (p === 'youtube') return setup.google ? <a className="btn dark" href="/api/oauth/google/start">Connect YouTube</a> : <span className="small muted">Add the Google keys first (README step 4).</span>;
    if (p === 'facebook' || p === 'instagram') return setup.meta ? <a className="btn dark" href="/api/oauth/meta/start">Connect Facebook and Instagram</a> : <span className="small muted">Add the Meta keys first (README step 5).</span>;
    return (
      <form className="inline" onSubmit={(e) => { e.preventDefault(); run(() => connectTikTok({ apiKey: key, user })); }}>
        <label style={{ flex: '1 1 180px' }}><span className="sr-only">Upload-Post API key</span><input className="input" placeholder="Upload-Post API key" value={key} onChange={(e) => setKey(e.target.value)} /></label>
        <label style={{ flex: '1 1 140px' }}><span className="sr-only">Upload-Post profile name</span><input className="input" placeholder="Profile name" value={user} onChange={(e) => setUser(e.target.value)} /></label>
        <button className="btn dark" disabled={pending}>Connect TikTok</button>
      </form>
    );
  };

  return (
    <>
      <header className="head"><div><h1>Accounts</h1><p className="small muted">Connect each platform once. The studio posts with these accounts.</p></div></header>
      {banner.ok && <div className="banner info" role="status">{banner.ok}</div>}
      {banner.error && <div className="banner bad" role="alert">{banner.error}</div>}

      <div className="cols">
        <div className="main">
          <div className="grid2">
            {PLATFORMS.map((p) => (
              <section className="card acct-card" key={p} aria-labelledby={`h-${p}`}>
                <div className="top">
                  <PlatformBadge p={p} />
                  <h2 id={`h-${p}`}>{PLATFORM_NAMES[p]}</h2>
                  {connected[p] ? <span className="pill sch">Connected</span> : <span className="pill fail">Not connected</span>}
                </div>
                {connected[p] && <p><b>{connected[p]}</b></p>}
                <p className="small muted">{NOTE[p]}</p>
                <div>{connected[p] ? <ConfirmButton className="btn" label="Disconnect" confirmLabel="Press again to disconnect" onConfirm={() => run(() => disconnect(p))} /> : connectButton(p)}</div>
              </section>
            ))}
          </div>
        </div>
        <aside className="side">
          <section className="card setup" aria-labelledby="setup">
            <div className="panel-h"><h2 id="setup" className="label">Setup</h2><span className="score">{done} of {steps.length}</span></div>
            <div className="meter" aria-hidden="true"><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
            <ol>
              {steps.map(([label, ok, how]) => (
                <li key={label}>
                  <span style={{ color: ok ? 'var(--ok)' : 'var(--faint)' }}><Icon name={ok ? 'check' : 'alert'} size={18} stroke={2.6} /></span>
                  <span>{label}{!ok && <span className="small muted" style={{ display: 'block' }}>{how}</span>}</span>
                  <span className="sr-only">{ok ? 'done' : 'to do'}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
