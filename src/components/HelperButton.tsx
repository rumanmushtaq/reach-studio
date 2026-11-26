'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { helperJob, type HelperSite } from '@/app/actions';
import { useToast } from './ui';

// Free posting where no app may post: TikTok, and Facebook personal profiles. The Reach Studio posting helper
// extension (extensions/tiktok-helper) opens the site's upload page and saves this video to Downloads; the
// owner picks it, the helper writes Claude's caption, and the owner posts. The extension marks the page with
// data-reach-tiktok so the studio knows it is installed, and answers each request so the studio can say what
// happened.
export const HELPER_MESSAGE = 'reach-studio:tiktok-post';
const HELPER_ANSWER = 'reach-studio:tiktok-answer';

const SITE_NAMES: Record<HelperSite, string> = { tiktok: 'TikTok', facebook: 'Facebook' };

/**
 * Asks the helper to open the site; resolves with its answer, or a timeout after 5 seconds. After the helper is
 * updated, a stale copy left in this page answers at once with an error, so an error waits a moment for the
 * current helper's success.
 */
function askHelper(job: unknown): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let failed: { ok: false; error?: string } | null = null;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const done = (r: { ok: boolean; error?: string }) => { window.removeEventListener('message', onAnswer); clearTimeout(timer); clearTimeout(grace); resolve(r); };
    const onAnswer = (e: MessageEvent) => {
      if (e.source !== window || e.data?.type !== HELPER_ANSWER) return;
      if (e.data.ok) return done({ ok: true });
      if (!failed) { failed = { ok: false, error: e.data.error }; grace = setTimeout(() => done(failed!), 2000); }
    };
    const timer = setTimeout(() => done(failed ?? { ok: false, error: 'The posting helper did not answer. Reload this page, then try again.' }), 5000);
    window.addEventListener('message', onAnswer);
    window.postMessage({ type: HELPER_MESSAGE, job }, window.location.origin);
  });
}

export function HelperButton({ videoId, site, disabled }: { videoId: string; site: HelperSite; disabled?: boolean }) {
  const toast = useToast();
  const name = SITE_NAMES[site];
  const [installed, setInstalled] = useState<boolean | null>(null); // null until the browser has checked
  useEffect(() => {
    const check = () => setInstalled(document.documentElement.dataset.reachTiktok === '1');
    check();
    const t = setTimeout(check, 1000); // the extension may mark the page a moment after it loads
    return () => clearTimeout(t);
  }, []);
  const send = useMutation({
    mutationFn: async () => {
      const r = await helperJob(videoId, site);
      if (!r.ok) return r;
      return askHelper(r.job);
    },
    onSuccess: (r) => toast(r.ok
      ? `${name} is opening and the video is saving to Downloads. Pick it there; the caption fills by itself.`
      : r.error ?? 'The posting helper did not answer'),
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not get the video ready'),
  });

  if (installed === false) {
    return <Link className="small" style={{ fontWeight: 700 }} href="/settings#tiktok-helper">Get the posting helper</Link>;
  }
  return (
    <button className="btn sm" disabled={disabled || installed === null || send.isPending} onClick={() => send.mutate()}>
      {send.isPending ? 'Getting it ready…' : `Post to ${name}`}
    </button>
  );
}
