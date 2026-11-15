'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { connectTikTok, disconnect } from '@/app/actions';
import { PLATFORM_NAMES, PLATFORMS, type Platform } from '@/lib/seo';
import { ConfirmButton, useToast } from './ui';

const NOTE: Record<Platform, string> = {
  youtube: 'Google sign-in. New Google API apps post private videos until Google approves the app, so apply for the audit in your first week.',
  facebook: 'Your Facebook Page. Videos are uploaded early and Facebook publishes them at the slot.',
  instagram: 'A Business or Creator account linked to your Facebook Page. Connects with the Facebook sign-in.',
  tiktok: 'Through Upload-Post, because TikTok blocks public posts from apps it has not approved.',
};

export function AccountsView({ connected, setup, banner }: {
  connected: Record<Platform, string | null>;
  setup: { google: boolean; meta: boolean };
  banner: { ok?: string; error?: string };
}) {
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

  const connectButton = (p: Platform) => {
    if (p === 'youtube') return setup.google ? <a className="btn sm primary" href="/api/oauth/google/start">Connect YouTube</a> : <span className="small muted">Add the Google keys first (README, step 4).</span>;
    if (p === 'facebook' || p === 'instagram') return setup.meta ? <a className="btn sm primary" href="/api/oauth/meta/start">Connect Facebook + Instagram</a> : <span className="small muted">Add the Meta keys first (README, step 5).</span>;
    return (
      <form className="inline" onSubmit={(e) => { e.preventDefault(); run(() => connectTikTok({ apiKey: key, user })); }}>
        <input className="input" placeholder="Upload-Post API key" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Upload-Post API key" />
        <input className="input" placeholder="Profile name" value={user} onChange={(e) => setUser(e.target.value)} aria-label="Upload-Post profile name" />
        <button className="btn sm primary" disabled={pending}>Connect TikTok</button>
      </form>
    );
  };

  return (
    <>
      <div className="top"><div><h1>Accounts</h1><p className="sub">Connect each platform once. The studio posts with these accounts.</p></div></div>
      {banner.ok && <div className="banner info small">{banner.ok}</div>}
      {banner.error && <div className="banner bad small">{banner.error}</div>}
      <div className="grid2">
        {PLATFORMS.map((p) => (
          <div className="card acct" key={p}>
            <div className="row">
              <h2>{PLATFORM_NAMES[p]}</h2>
              {connected[p] ? <span className="pill sch">Connected</span> : <span className="pill fail">Not connected</span>}
            </div>
            {connected[p] && <p className="small"><b>{connected[p]}</b></p>}
            <p className="small muted">{NOTE[p]}</p>
            <div>
              {connected[p]
                ? <ConfirmButton className="btn sm" label="Disconnect" confirmLabel="Press again to disconnect" onConfirm={() => run(() => disconnect(p))} />
                : connectButton(p)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
