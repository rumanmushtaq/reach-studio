'use client';

import Link from 'next/link';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
  const search = useForm<{ q: string }>({ defaultValues: { q: '' } });
  const q = useWatch({ control: search.control, name: 'q' }) ?? '';
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
          <input className="input" type="search" placeholder="Search by name" {...search.register('q')} />
        </label>
      </div>
      {shown.length === 0
        ? <div className="empty">{items.length ? 'No videos match.' : <>No videos yet. <Link href="/upload">Add your first cartoon</Link>.</>}</div>
        : <Rows items={shown} />}
    </>
  );
}

const ROW_GAP = 8;

/** Only the rows on screen are in the page, so the library stays fast with hundreds of videos. */
function Rows({ items }: { items: LibItem[] }) {
  const list = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0); // where the list starts on the page, for the window scroller
  useLayoutEffect(() => { setOffset(list.current?.offsetTop ?? 0); }, []);
  const rows = useWindowVirtualizer({ count: items.length, estimateSize: () => 92 + ROW_GAP, overscan: 6, scrollMargin: offset });
  return (
    <div ref={list} role="list" style={{ position: 'relative', height: rows.getTotalSize() }}>
      {rows.getVirtualItems().map((r) => {
        const i = items[r.index];
        return (
          <div key={i.id} role="listitem" data-index={r.index} ref={rows.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', paddingBottom: ROW_GAP, transform: `translateY(${r.start - rows.options.scrollMargin}px)` }}>
            <Link href={`/videos/${i.id}`} className="lib-row">
            <Thumb url={i.thumb} vertical={i.vertical} />
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</b>
              <span className="chips" style={{ marginTop: 6 }}>{i.chips.map((c) => <span key={c.platform} className={`chip ${c.tone}`}><b>{c.short}</b>{c.text}</span>)}</span>
            </span>
            <span className="when mono small">{formatSlot(i.slotAt)}</span>
            <Pill status={i.status} />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
