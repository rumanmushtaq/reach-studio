'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Status } from '@/lib/plan';
import { logout } from '@/app/actions';

// ---------- toast ----------

const ToastCtx = createContext<(msg: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast" role="status" hidden={!msg}>{msg}</div>
    </ToastCtx.Provider>
  );
}

// ---------- shell ----------

const NAV = [
  { href: '/', label: 'Videos', key: 'videos' },
  { href: '/calendar', label: 'Calendar', key: 'calendar' },
  { href: '/free-slots', label: 'Free slots', key: 'free' },
  { href: '/accounts', label: 'Accounts', key: 'accounts' },
  { href: '/settings', label: 'Settings', key: 'settings' },
] as const;

export function Rail({ counts }: { counts: Partial<Record<(typeof NAV)[number]['key'], string>> }) {
  const path = usePathname();
  const active = (href: string) => (href === '/' ? path === '/' || path.startsWith('/videos') : path.startsWith(href));
  return (
    <nav className="rail" aria-label="Pages">
      <div className="brand"><span className="logo">R</span><b>Reach Studio</b></div>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`nav ${active(n.href) ? 'on' : ''}`}>
          {n.label} <span className="count">{counts[n.key] ?? ''}</span>
        </Link>
      ))}
      <form action={logout}><button className="logout">Sign out</button></form>
    </nav>
  );
}

/** Re-reads server data every few seconds while something is in progress. */
export function AutoRefresh({ active, everyMs = 4000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      const a = document.activeElement;
      if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return; // never while typing
      router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}

export function Pill({ status }: { status: Status }) {
  return <span className={`pill ${status.tone}`}>{status.busy && <span className="spin" />}{status.label}</span>;
}

export function Thumb({ url, vertical, big }: { url?: string; vertical: boolean; big?: boolean }) {
  const cls = `thumb${vertical ? ' vert' : ''}`;
  const style = big ? (vertical ? { width: 60, height: 100 } : { width: 160, height: 96 }) : undefined;
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className={cls} src={url} alt="" style={style} /> : <span className={cls} style={style} />;
}

/** A button that needs a second press within 4 s, for destructive actions. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn danger sm' }: {
  label: string; confirmLabel: string; onConfirm: () => void; className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return <button className={className} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>{armed ? confirmLabel : label}</button>;
}
