'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Chip } from '@/lib/schedule';
import type { Status } from '@/lib/plan';
import { formatSlot } from '@/lib/slots';
import { Icon, Pill, Thumb } from './ui';

export type LibItem = { id: string; name: string; slotAt: number | null; vertical: boolean; thumb?: string; status: Status; chips: Chip[]; group: 'upcoming' | 'live' | 'attention' };

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Coming up' },
  { key: 'live', label: 'Live' },
  { key: 'attention', label: 'Needs you' },
] as const;

export function LibraryView({ items }: { items: LibItem[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const [q, setQ] = useState('');
  const shown = useMemo(() => items.filter((i) => (tab === 'all' || i.group === tab) && i.name.toLowerCase().includes(q.trim().toLowerCase())), [items, tab, q]);
  const count = (k: string) => (k === 'all' ? items.length : items.filter((i) => i.group === k).length);

  return (
    <>
      <header className="head">
        <h1>Library</h1>
        <Link className="btn primary" href="/upload"><Icon name="plus" size={18} stroke={2.4} />Add videos</Link>
      </header>
      <div className="panel-h">
        <div className="seg" role="tablist" aria-label="Filter">
          {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>{t.label} · {count(t.key)}</button>)}
        </div>
        <label style={{ flex: '1 1 220px', maxWidth: 340 }}>
          <span className="sr-only">Search videos</span>
          <input className="input" type="search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.length === 0 && <div className="empty">{items.length ? 'No videos match.' : <>No videos yet. <Link href="/upload">Add your first cartoon</Link>.</>}</div>}
        {shown.map((i) => (
          <Link key={i.id} href={`/videos/${i.id}`} className="lib-row">
            <Thumb url={i.thumb} vertical={i.vertical} />
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</b>
              <span className="chips" style={{ marginTop: 6 }}>{i.chips.map((c) => <span key={c.platform} className={`chip ${c.tone}`}><b>{c.short}</b>{c.text}</span>)}</span>
            </span>
            <span className="when mono small">{formatSlot(i.slotAt)}</span>
            <Pill status={i.status} />
          </Link>
        ))}
      </div>
    </>
  );
}
