'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { deleteVideo, retry } from '@/app/actions';
import type { Attention } from '@/lib/attention';
import { PLATFORM_NAMES } from '@/lib/seo';
import { PlatformBadge, useToast } from './ui';

/** The "Needs you" box: one row per problem, each with the button that fixes it. */
export function AttentionBox({ items }: { items: Attention[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  if (!items.length) return null;

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    toast(r.ok ? r.message ?? 'Done' : r.error ?? 'Something went wrong');
    router.refresh();
  });

  return (
    <section className="attention" aria-labelledby="needs-you">
      <h2 id="needs-you">Needs you · {items.length}</h2>
      {items.map((it) => (
        <div className="att-row" key={it.key}>
          {it.kind === 'upload' ? <span className="pb" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }} aria-hidden="true">!</span> : <PlatformBadge p={it.platform} />}
          <div className="what"><b>{it.title}</b><p>{it.detail}</p></div>
          {it.kind === 'failed' && (
            <>
              <Link className="btn" href={`/videos/${it.videoId}`}>Open video</Link>
              {/reconnect|api key|sign-in|not connected/i.test(it.detail)
                ? <Link className="btn dark" href="/accounts">Fix account</Link>
                : <button className="btn dark" disabled={pending} onClick={() => run(() => retry(it.postId))}>Retry now</button>}
            </>
          )}
          {it.kind === 'account' && <Link className="btn dark" href="/accounts">Connect {PLATFORM_NAMES[it.platform]}</Link>}
          {it.kind === 'upload' && (
            <button className="btn danger" disabled={pending} onClick={() => run(() => deleteVideo(it.videoId))}>Remove</button>
          )}
        </div>
      ))}
    </section>
  );
}
