'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { deleteVideo, moveSlot, retry, rewriteSeo, saveSeo, saveVideoInfo, setPlatforms } from '@/app/actions';
import type { PostRow, VideoRow } from '@/lib/db/schema';
import { videoStatus } from '@/lib/plan';
import { FIELDS, fieldUse, linksBlock, PLATFORM_NAMES, PLATFORMS, splitList, toHashtags, type Links, type Platform, type Seo } from '@/lib/seo';
import { EARLY_UPLOAD, formatSlot } from '@/lib/slots';
import { ConfirmButton, Pill, Thumb, useToast } from './ui';
import { duration } from './VideoRow';

type Props = {
  video: VideoRow; posts: PostRow[]; thumb?: string; free: number[]; now: number;
  connected: Record<Platform, string | null>; links: Links;
};

export function VideoDetail({ video, posts, thumb, free, now, connected, links }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const status = videoStatus(video, posts, now);
  const anyLive = posts.some((p) => p.state === 'live');
  const writing = video.seoState !== 'ready';

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? 'Something went wrong');
      else { if (r.message) toast(r.message); after?.(); }
      router.refresh();
    });

  const missing = PLATFORMS.filter((p) => video.platforms[p] && !connected[p]);
  const postFor = (p: Platform) => posts.find((x) => x.platform === p);
  const steps: [string, boolean, string][] = [
    ['Video added', true, formatSlot(video.createdAt)],
    ['SEO written', !writing, video.seoAt ? (video.seoSource === 'claude' ? 'by Claude' : 'basic draft') : 'in progress'],
    ['Slot booked', !!video.slotAt, video.slotAt ? formatSlot(video.slotAt) : 'after SEO'],
    ['YouTube + Facebook upload early', posts.some((p) => p.state === 'scheduled' || p.state === 'live'), video.slotAt ? formatSlot(video.slotAt - EARLY_UPLOAD) : '6 h before slot'],
    ['Live everywhere', status.tone === 'live', video.slotAt ? formatSlot(video.slotAt) : '–'],
  ];
  const nowIdx = steps.findIndex((s) => !s[1]);

  return (
    <>
      <div className="top">
        <div><Link className="btn ghost sm" href="/">← Videos</Link></div>
        <div className="inline"><Pill status={status} /></div>
      </div>

      <InfoCard video={video} thumb={thumb} onSave={(info) => run(() => saveVideoInfo(video.id, info))} />

      <div className="two">
        <div className="card">
          <h2>Posting slot</h2>
          <dl className="kv"><dt>Goes live</dt><dd className="mono"><b>{formatSlot(video.slotAt)}</b></dd><dt>Time zone</dt><dd>Pakistan (PKT)</dd></dl>
          {anyLive ? <p className="small muted">This video is live, so its slot is fixed.</p> : video.slotAt ? (
            <SlotMover free={free} pending={pending} onMove={(ms) => run(() => moveSlot(video.id, ms))} />
          ) : <p className="small muted">The slot is booked as soon as the SEO is ready.</p>}
        </div>

        <div className="card">
          <h2>Where it posts</h2>
          <div className="toggles">
            {PLATFORMS.map((p) => (
              <label key={p} className="tog">
                <input
                  type="checkbox" checked={video.platforms[p]} disabled={pending || postFor(p)?.state === 'live'}
                  onChange={(e) => run(() => setPlatforms(video.id, { ...video.platforms, [p]: e.target.checked }))}
                />
                {PLATFORM_NAMES[p]}
              </label>
            ))}
          </div>
          {missing.length > 0 && (
            <div className="banner warn small">
              <span>{missing.map((p) => PLATFORM_NAMES[p]).join(', ')} {missing.length > 1 ? 'are' : 'is'} not connected. Connect before {formatSlot(video.slotAt)}.</span>
              <Link className="btn sm" href="/accounts">Accounts</Link>
            </div>
          )}
          <ol className="timeline">
            {steps.map((s, i) => (
              <li key={s[0]}><span className={`tl-dot ${s[1] ? 'done' : i === nowIdx ? 'now' : ''}`} /><span><b>{s[0]}</b> <span className="muted small mono">{s[2]}</span></span></li>
            ))}
          </ol>
          {posts.filter((p) => video.platforms[p.platform]).map((p) => (
            <div key={p.id} className="inline small" style={{ justifyContent: 'space-between' }}>
              <span><b>{PLATFORM_NAMES[p.platform]}</b>: {p.state === 'live' ? 'live' : p.state === 'failed' ? 'failed' : p.state === 'scheduled' ? 'uploaded, goes public at the slot' : p.state === 'staged' ? 'ready on Instagram' : 'waiting'}
                {p.lastError && <span className="err"> · {p.lastError}</span>}</span>
              <span className="inline">
                {p.url && <a className="copy" href={p.url} target="_blank" rel="noreferrer">Open</a>}
                {p.state === 'failed' && <button className="btn sm" disabled={pending} onClick={() => run(() => retry(p.id))}>Retry</button>}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-h">
          <h2>SEO</h2>
          <button className="btn sm" disabled={writing || pending || anyLive} onClick={() => run(() => rewriteSeo(video.id))}>
            {writing ? <><span className="spin" /> Claude is writing…</> : 'Write with Claude'}
          </button>
        </div>
        {video.seoNote && <div className="banner warn small">{video.seoNote}</div>}
        {writing && !video.seo && <p className="muted">Claude is looking at the frames, checking what is trending, and writing the titles, tags and hashtags. This takes about a minute.</p>}
        {video.seo && <SeoEditor key={video.seoAt ?? 0} videoId={video.id} seo={video.seo} platforms={video.platforms} links={links} locked={anyLive} />}
      </div>

      <div className="inline">
        <ConfirmButton
          label="Remove video" confirmLabel="Press again to remove"
          onConfirm={() => run(() => deleteVideo(video.id), () => router.push('/'))}
        />
      </div>
    </>
  );
}

function InfoCard({ video, thumb, onSave }: { video: VideoRow; thumb?: string; onSave: (info: { name: string; note: string }) => void }) {
  const [name, setName] = useState(video.name);
  const [note, setNote] = useState(video.note);
  const save = () => { if (name !== video.name || note !== video.note) onSave({ name, note }); };
  return (
    <div className="card">
      <div className="dhead">
        <Thumb url={thumb} vertical={video.shape === 'vertical'} big />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div className="field"><label htmlFor="vname">Video name</label><input className="input" id="vname" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} /></div>
          <div className="field"><label htmlFor="vnote">What happens in it</label><input className="input" id="vnote" value={note} placeholder="Optional note for Claude" onChange={(e) => setNote(e.target.value)} onBlur={save} /></div>
          <p className="small muted">
            {video.shape === 'vertical' ? 'Vertical' : 'Horizontal'} · {duration(video.duration)} long · {video.fileName}
            {video.fileDeletedAt ? ' · file deleted after posting' : ''}
          </p>
        </div>
      </div>
      {video.uploadState === 'uploading' && <div className="banner warn small">This upload did not finish. Remove the video and add it again.</div>}
    </div>
  );
}

function SlotMover({ free, pending, onMove }: { free: number[]; pending: boolean; onMove: (ms: number) => void }) {
  const [sel, setSel] = useState('');
  return (
    <div className="field">
      <label htmlFor="move">Move to another free slot</label>
      <div className="inline">
        <select className="input" id="move" value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">Choose a free slot…</option>
          {free.map((ms) => <option key={ms} value={ms}>{formatSlot(ms)}</option>)}
        </select>
        <button className="btn sm" disabled={!sel || pending} onClick={() => onMove(Number(sel))}>Move</button>
      </div>
    </div>
  );
}

function SeoEditor({ videoId, seo: initial, platforms, links, locked }: {
  videoId: string; seo: Seo; platforms: Record<Platform, boolean>; links: Links; locked: boolean;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Platform>('youtube');
  const [seo, setSeo] = useState(initial);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(seo);
  latest.current = seo;

  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (p: Platform, key: string, kind: string, value: string) => {
    setTexts((t) => ({ ...t, [`${p}.${key}`]: value }));
    const parsed = kind === 'list' ? (key === 'hashtags' ? toHashtags(value) : splitList(value)) : value;
    const next = { ...seo, [p]: { ...seo[p], [key]: parsed } } as Seo;
    setSeo(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveSeo(videoId, latest.current);
      if (!r.ok) toast(r.error);
    }, 700);
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Select the text and press Ctrl+C'); }
  };

  return (
    <>
      <div className="tabs" role="tablist">
        {PLATFORMS.map((p) => (
          <button key={p} className={`tab ${tab === p ? 'on' : ''}`} role="tab" aria-selected={tab === p} onClick={() => setTab(p)}>
            {PLATFORM_NAMES[p]}{!platforms[p] && <span className="off"> (off)</span>}
          </button>
        ))}
      </div>
      <div className="fields">
        {FIELDS[tab].map((f) => {
          const raw = (seo[tab] as Record<string, string | string[]>)[f.key];
          const shown = texts[`${tab}.${f.key}`] ?? (Array.isArray(raw) ? raw.join(', ') : raw);
          const use = fieldUse(raw, f);
          const id = `f-${tab}-${f.key}`;
          return (
            <div className="field" key={id}>
              <label htmlFor={id}>
                <span>{f.label}</span>
                <span className="inline" style={{ gap: 10 }}>
                  <span className={`cnt ${use.over ? 'over' : ''}`}>{use.used} / {f.max}{use.over ? ' · too long' : ''}</span>
                  <button className="copy" onClick={(e) => { e.preventDefault(); void copy(shown); }}>Copy</button>
                </span>
              </label>
              {f.kind === 'text'
                ? <textarea className="input" id={id} value={shown} readOnly={locked} onChange={(e) => change(tab, f.key, f.kind, e.target.value)} />
                : <input className="input" id={id} value={shown} readOnly={locked} onChange={(e) => change(tab, f.key, f.kind, e.target.value)} />}
            </div>
          );
        })}
        {(tab === 'youtube' || tab === 'facebook') && (
          <div className="field"><span className="lbl">Added at the end when posting</span><div className="linkbox">{linksBlock(links) || 'No channel links yet. Add them in Settings.'}</div></div>
        )}
        {tab === 'youtube' && <p className="small muted">Cartoons are posted as made for kids, so YouTube turns comments off. Facebook and Instagram get the first comment.</p>}
      </div>
    </>
  );
}
