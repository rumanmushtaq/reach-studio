import Link from 'next/link';
import type { ReactNode } from 'react';

// Public pages Google and Meta link to from their sign-in screens: no sign-in needed.

export const CONTACT_EMAIL = 'mazharkisanaoffice@gmail.com';
export const UPDATED = '18 November 2026';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="legal">
      <Link href="/login" className="legal-brand"><span className="logo">R</span>Reach Studio</Link>
      <article>
        <h1>{title}</h1>
        <p className="small muted">Last updated {UPDATED}</p>
        {children}
      </article>
      <footer className="small muted">
        <Link href="/privacy">Privacy policy</Link> · <Link href="/terms">Terms of service</Link> · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </footer>
    </main>
  );
}
