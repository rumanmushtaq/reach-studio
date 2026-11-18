import type { CSSProperties } from 'react';

// Loading placeholders. Each page's loading.tsx builds its own shape from these, inside the same layout
// classes as the real page, so the cards appear where the real ones will.

type Size = { w?: number | string; h?: number | string; style?: CSSProperties };

/** One grey shimmering block. */
export function Sk({ w = '100%', h = 14, style, round }: Size & { round?: boolean }) {
  return <span className={`sk${round ? ' sk-round' : ''}`} style={{ width: w, height: h, ...style }} />;
}

/** Text lines of falling width. */
export function SkLines({ n = 2, last = '60%' }: { n?: number; last?: string }) {
  return <span className="sk-lines">{Array.from({ length: n }, (_, i) => <Sk key={i} h={12} w={i === n - 1 ? last : '100%'} />)}</span>;
}

/** The page title row: eyebrow or subtitle, title, and buttons on the right. */
export function SkHead({ eyebrow, sub, buttons = 0, title = 320 }: { eyebrow?: boolean; sub?: boolean; buttons?: number; title?: number }) {
  return (
    <header className="head">
      <div className="sk-col">
        {eyebrow && <Sk w={170} h={12} />}
        <Sk w={title} h={36} />
        {sub && <Sk w={300} h={12} />}
      </div>
      {buttons > 0 && <div className="actions">{Array.from({ length: buttons }, (_, i) => <Sk key={i} w={i === buttons - 1 ? 140 : 120} h={44} />)}</div>}
    </header>
  );
}

/** A form field: label and input box. */
export function SkField({ label = 110 }: { label?: number }) {
  return <span className="sk-field"><Sk w={label} h={12} /><Sk h={44} /></span>;
}

/** Wraps a loading page so screen readers hear one "Loading" instead of empty shapes. */
export function SkPage({ children }: { children: React.ReactNode }) {
  return <div className="skeleton" role="status" aria-label="Loading" aria-busy="true">{children}</div>;
}
