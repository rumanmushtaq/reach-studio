'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { tiktokJob } from '@/app/actions';
import { useToast } from './ui';

// Free TikTok posting: the Reach Studio TikTok helper extension (extensions/tiktok-helper) opens TikTok's
// upload page and saves this video to Downloads; the owner picks it, the helper writes Claude's caption, and
// the owner presses Post. The extension marks the page with data-reach-tiktok so the studio knows it is
// installed, and answers each request so the studio can say what happened.
export const TIKTOK_MESSAGE = 'reach-studio:tiktok-post';
const TIKTOK_ANSWER = 'reach-studio:tiktok-answer';

/** Asks the helper to open TikTok; resolves with its answer, or a timeout after 5 seconds. */
function askHelper(job: unknown): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const done = (r: { ok: boolean; error?: string }) => { window.removeEventListener('message', onAnswer); clearTimeout(timer); resolve(r); };
    const onAnswer = (e: MessageEvent) => { if (e.source === window && e.data?.type === TIKTOK_ANSWER) done({ ok: !!e.data.ok, error: e.data.error }); };
    const timer = setTimeout(() => done({ ok: false, error: 'The TikTok helper did not answer. Reload this page, then try again.' }), 5000);
    window.addEventListener('message', onAnswer);
    window.postMessage({ type: TIKTOK_MESSAGE, job }, window.location.origin);
  });
}

export function TikTokButton({ videoId, disabled }: { videoId: string; disabled?: boolean }) {
  const toast = useToast();
  const [installed, setInstalled] = useState<boolean | null>(null); // null until the browser has checked
  useEffect(() => {
    const check = () => setInstalled(document.documentElement.dataset.reachTiktok === '1');
    check();
    const t = setTimeout(check, 1000); // the extension may mark the page a moment after it loads
    return () => clearTimeout(t);
  }, []);
  const send = useMutation({
    mutationFn: async () => {
      const r = await tiktokJob(videoId);
      if (!r.ok) return r;
      return askHelper(r.job);
    },
    onSuccess: (r) => toast(r.ok
      ? 'TikTok is opening and the video is saving to Downloads. Pick it with Select video; the caption fills by itself.'
      : r.error ?? 'The TikTok helper did not answer'),
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not get the video ready'),
  });

  if (installed === false) {
    return <Link className="small" style={{ fontWeight: 700 }} href="/settings#tiktok-helper">Get the TikTok helper</Link>;
  }
  return (
    <button className="btn sm" disabled={disabled || installed === null || send.isPending} onClick={() => send.mutate()}>
      {send.isPending ? 'Getting it ready…' : 'Post to TikTok'}
    </button>
  );
}
