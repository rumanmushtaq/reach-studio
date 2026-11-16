'use client';

import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { moveSlot } from '@/app/actions';
import { formatSlot } from '@/lib/slots';
import { useToast } from './ui';

// TanStack Query runs every call the browser makes: API routes as queries and mutations, and server
// actions as mutations, so loading, errors and retries work the same everywhere.

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

type ActionResult = { ok: boolean; message?: string; error?: string };

/**
 * Runs a server action as a mutation: shows its message (or error) as a toast and refreshes the page data.
 * `run(() => retry(id), onDone)`; `pending` is true while any call from this hook runs.
 */
export function useAction(successMessage = 'Done') {
  const router = useRouter();
  const toast = useToast();
  const m = useMutation({
    mutationFn: (fn: () => Promise<ActionResult>) => fn(),
    onSuccess: (r) => toast(r.ok ? r.message ?? successMessage : r.error ?? 'Something went wrong'),
    onError: (err) => toast(err instanceof Error ? err.message : 'Something went wrong'),
    onSettled: () => router.refresh(),
  });
  const run = (fn: () => Promise<ActionResult>, onDone?: () => void) =>
    m.mutate(fn, { onSuccess: (r) => { if (r.ok) onDone?.(); } });
  return { run, pending: m.isPending };
}

/** Moves a video to another time, with an Undo in the toast that moves it back. */
export function useMoveSlot() {
  const router = useRouter();
  const toast = useToast();
  const m = useMutation({
    mutationFn: (v: { id: string; to: number }) => moveSlot(v.id, v.to),
    onError: (err) => toast(err instanceof Error ? err.message : 'Something went wrong'),
    onSettled: () => router.refresh(),
  });
  const move = (id: string, to: number, video: { name: string; from: number | null }) =>
    m.mutate({ id, to }, {
      onSuccess: (r) => {
        if (!r.ok) return toast(r.error);
        toast(`Moved ${video.name} to ${formatSlot(to)}`, video.from ? { label: 'Undo', run: () => m.mutate({ id, to: video.from! }) } : undefined);
      },
    });
  return { move, pending: m.isPending };
}
