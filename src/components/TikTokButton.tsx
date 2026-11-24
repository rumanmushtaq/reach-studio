'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { tiktokJob } from '@/app/actions';
import { useToast } from './ui';

// Free TikTok posting: the Reach Studio TikTok helper extension (extensions/tiktok-helper) opens TikTok's
// upload page, adds this video and Claude's caption, and leaves the Post button to the owner. The extension
// marks the page with data-reach-tiktok so the studio knows it is installed.
export const TIKTOK_MESSAGE = 'reach-studio:tiktok-post';

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
    mutationFn: () => tiktokJob(videoId),
    onSuccess: (r) => {
      if (!r.ok) return toast(r.error);
      window.postMessage({ type: TIKTOK_MESSAGE, job: r.job }, window.location.origin);
      toast('Opening TikTok. Check the video and caption, then press Post.');
    },
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
