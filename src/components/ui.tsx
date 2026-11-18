'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { signOut } from '@/app/auth-actions';
import type { Status } from '@/lib/plan';
import { PLATFORM_SHORT, type Platform } from '@/lib/seo';
import { countdown } from '@/lib/slots';

// ---------- icons (stroke, follow text colour) ----------

const PATHS = {
  today: 'M3 12h4l3 8 4-16 3 8h4',
  planner: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  library: 'M3 5h18v14H3zM10 9l5 3-5 3z',
  accounts: 'M9 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 010 7M21 20c0-2.6-1.6-4.8-4-5.6',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  check: 'M5 12.5l4.5 4.5L19 7',
  alert: 'M12 8v5M12 16.5v.5',
  spark: 'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function PlatformBadge({ p, small }: { p: Platform; small?: boolean }) {
  return <span className={`pb ${p}${small ? ' sm' : ''}`} aria-hidden="true">{PLATFORM_SHORT[p]}</span>;
}

// ---------- toast with an optional action (Undo) ----------

type ToastAction = { label: string; run: () => void };
type ToastFn = (msg: string, action?: ToastAction) => void;
const ToastCtx = createContext<ToastFn>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [t, setT] = useState<{ msg: string; action?: ToastAction } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback<ToastFn>((msg, action) => {
    setT({ msg, action });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), action ? 10_000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast" role="status" aria-live="polite" hidden={!t}>
        <span>{t?.msg}</span>
        {t?.action && <button onClick={() => { const a = t.action!; setT(null); a.run(); }}>{t.action.label}</button>}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- navigation ----------

const NAV = [
  { href: '/', label: 'Today', icon: 'today', key: 'today' },
  { href: '/calendar', label: 'Planner', icon: 'planner', key: 'planner' },
  { href: '/library', label: 'Library', icon: 'library', key: 'library' },
  { href: '/accounts', label: 'Accounts', icon: 'accounts', key: 'accounts' },
  { href: '/settings', label: 'Settings', icon: 'settings', key: 'settings' },
] as const;

function useActive() {
  const path = usePathname();
  return (href: string) => (href === '/' ? path === '/' : href === '/library' ? path.startsWith('/library') || path.startsWith('/videos') : path.startsWith(href));
}

export type NavInfo = { attention: number; videos: number; accountsOff: number; storage: string; storagePct: number };

export function Rail({ info }: { info: NavInfo }) {
  const active = useActive();
  return (
    <nav className="rail" aria-label="Pages">
      <div className="brand"><span className="logo">R</span>Reach Studio</div>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} prefetch className={`nav ${active(n.href) ? 'on' : ''}`} aria-current={active(n.href) ? 'page' : undefined}>
          <Icon name={n.icon} />{n.label}
          {n.key === 'today' && info.attention > 0 && <span className="badge" aria-label={`${info.attention} need you`}>{info.attention}</span>}
          {n.key === 'library' && <span className="count">{info.videos}</span>}
          {n.key === 'accounts' && info.accountsOff > 0 && <span className="dot" aria-label={`${info.accountsOff} not connected`} />}
        </Link>
      ))}
      <div className="rail-foot">
        <span className="label" style={{ color: 'var(--navy-faint)' }}>Storage</span>
        <div className="meter" aria-hidden="true"><span style={{ width: `${Math.max(2, info.storagePct)}%` }} /></div>
        <span>{info.storage}</span>
        <form action={signOut}><button className="signout">Sign out</button></form>
      </div>
    </nav>
  );
}

export function BottomBar({ info }: { info: NavInfo }) {
  const active = useActive();
  const tab = (n: (typeof NAV)[number]) => (
    <Link key={n.href} href={n.href} prefetch className={`tab ${active(n.href) ? 'on' : ''}`} aria-current={active(n.href) ? 'page' : undefined}>
      <Icon name={n.icon} size={22} />{n.label}
      {n.key === 'today' && info.attention > 0 && <span className="badge">{info.attention}</span>}
    </Link>
  );
  return (
    <nav className="bottombar" aria-label="Pages">
      {tab(NAV[0])}{tab(NAV[1])}
      <Link href="/upload" prefetch className="fab" aria-label="Add videos"><Icon name="plus" size={28} stroke={2.6} /></Link>
      {tab(NAV[2])}{tab(NAV[4])}
    </nav>
  );
}

// ---------- small pieces ----------

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

/** "in 2 h 12 m", kept current every 30 seconds. */
export function Countdown({ to, now }: { to: number; now: number }) {
  const [t, setT] = useState(now);
  useEffect(() => {
    setT(Date.now());
    const i = setInterval(() => setT(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);
  return <>{countdown(to, t)}</>;
}

export function Pill({ status }: { status: Status }) {
  return <span className={`pill ${status.tone}`}>{status.busy && <span className="spin" aria-hidden="true" />}{status.label}</span>;
}

export function Thumb({ url, vertical }: { url?: string; vertical: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className={`thumb${vertical ? ' vert' : ''}`} src={url} alt="" /> : <span className={`thumb${vertical ? ' vert' : ''}`} aria-hidden="true" />;
}

/** A button that needs a second press within 4 s, for destructive actions. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn danger' }: {
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
