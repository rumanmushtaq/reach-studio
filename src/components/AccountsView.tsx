'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { connectTikTok, disconnect } from '@/app/actions';
import { tiktokSchema, type TikTokForm } from '@/lib/forms';
import { applyResult, Field, TextInput } from './forms';
import { useAction } from './query';
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
  const { run } = useAction();
  const connectTikTokCall = useMutation({ mutationFn: connectTikTok });
  const tiktok = useForm<TikTokForm>({ resolver: zodResolver(tiktokSchema), defaultValues: { apiKey: '', user: '' } });
  const te = tiktok.formState.errors;
  const submitTikTok = tiktok.handleSubmit(async (v) => {
    const r = await connectTikTokCall.mutateAsync(v);
    if (applyResult(tiktok, r)) { toast('TikTok connected'); tiktok.reset(); router.refresh(); }
  });

  const steps: [string, boolean, React.ReactNode][] = [
    ['Claude helper running on your laptop', setup.claude, 'Run npm run claude-helper (README step 3)'],
    ['Video storage', setup.storage, 'Set CLOUDINARY_URL (README step 2)'],
    ...PLATFORMS.map((p): [string, boolean, React.ReactNode] => [`${PLATFORM_NAMES[p]} connected`, !!connected[p], 'Connect it below']),
    ['Channel links for descriptions', setup.links, <Link key="l" href="/settings">Add in Settings</Link>],
  ];
  const done = steps.filter((s) => s[1]).length;

  const connectButton = (p: Platform) => {
    if (p === 'youtube') return setup.google ? <a className="btn dark" href="/api/oauth/google/start">Connect YouTube</a> : <span className="small muted">Add the Google keys first (README step 4).</span>;
    if (p === 'facebook' || p === 'instagram') return setup.meta ? <a className="btn dark" href="/api/oauth/meta/start">Connect Facebook and Instagram</a> : <span className="small muted">Add the Meta keys first (README step 5).</span>;
    return (
      <form className="inline" style={{ alignItems: 'flex-start' }} onSubmit={submitTikTok} noValidate>
        <div style={{ flex: '1 1 180px' }}><Field id="tt-key" label={<span className="sr-only">Upload-Post API key</span>} error={te.apiKey}>
          <TextInput form={tiktok} name="apiKey" id="tt-key" placeholder="Upload-Post API key" autoComplete="off" />
        </Field></div>
        <div style={{ flex: '1 1 140px' }}><Field id="tt-user" label={<span className="sr-only">Upload-Post profile name</span>} error={te.user}>
          <TextInput form={tiktok} name="user" id="tt-user" placeholder="Profile name" autoComplete="off" />
        </Field></div>
        <button className="btn dark" disabled={tiktok.formState.isSubmitting}>Connect TikTok</button>
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
