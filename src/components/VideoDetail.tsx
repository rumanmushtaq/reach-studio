'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  deleteVideo, moveSlot, removeCustomThumb, retry, rewriteSeo, saveSeo, saveVideoInfo, setCustomThumb, setPlatforms, thumbnailUploadUrl,
} from '@/app/actions';
import { put } from '@/lib/browser-video';
import type { PostRow, VideoRow } from '@/lib/db/schema';
import { videoStatus } from '@/lib/plan';
import { reachChecks } from '@/lib/reach';
import { FIELDS, fieldUse, linksBlock, PLATFORM_NAMES, PLATFORMS, splitList, toHashtags, type FieldDef, type Links, type Platform, type Seo } from '@/lib/seo';
import { EARLY_UPLOAD, formatSlot, formatTime, IG_STAGE, slotProblem } from '@/lib/slots';
import { SlotPicker, type Taken } from './SlotPicker';
import { ConfirmButton, Countdown, Icon, Pill, PlatformBadge, useToast } from './ui';

type Props = {
  video: VideoRow; posts: PostRow[]; thumb?: string; customThumb?: string; free: number[]; taken: Taken[]; now: number;
  connected: Record<Platform, string | null>; links: Links; channel: string;
};
type Result = { ok: boolean; message?: string; error?: string };

const len = (sec: number | null) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '');

export function VideoDetail(props: Props) {
  const { video, posts, now, connected } = props;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<Platform>(PLATFORMS.find((p) => video.platforms[p]) ?? 'youtube');
  const status = videoStatus(video, posts, now);
  const anyLive = posts.some((p) => p.state === 'live');
  const writing = video.seoState !== 'ready';

  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? 'Something went wrong');
      else { if (r.message) toast(r.message); after?.(); }
      router.refresh();
    });

  const move = (to: number) => {
    const from = video.slotAt;
    start(async () => {
      const r = await moveSlot(video.id, to);
      if (!r.ok) toast(r.error);
      else toast(`Moved to ${formatSlot(to)}`, from ? { label: 'Undo', run: () => void moveSlot(video.id, from).then(() => router.refresh()) } : undefined);
      router.refresh();
    });
  };

  return (
    <>
      <header className="vhead">
        <Link className="btn" href="/"><Icon name="back" size={16} stroke={2.4} />Today</Link>
        <div className="t">
          <h1>{video.name}</h1>
          <div className="small muted">
            {video.shape === 'vertical' ? 'Vertical' : 'Horizontal'}{video.duration ? ` · ${len(video.duration)}` : ''} · added {formatSlot(video.createdAt)}
            {video.seoAt ? ` · SEO ${video.seoSource === 'claude' ? 'by Claude' : 'basic draft'}` : ''}
            {video.fileDeletedAt ? ' · file cleaned up after posting' : ''}
          </div>
        </div>
        <Pill status={status} />
        <button className="btn" disabled={writing || pending || anyLive} onClick={() => run(() => rewriteSeo(video.id))}>
          {writing ? <><span className="spin" aria-hidden="true" />Claude is writing…</> : <><Icon name="spark" size={16} />Rewrite with Claude</>}
        </button>
      </header>

      {video.uploadState === 'uploading' && <div className="banner warn">This upload did not finish. Remove the video and add it again.</div>}
      {video.seoNote && <div className="banner warn">{video.seoNote}</div>}

      <div className="cols side-first">
        <div className="main" style={{ gap: 20 }}>
          <section className="card" aria-labelledby="pv" style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
            <div className="panel-h" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-2)' }}>
              <h2 id="pv" className="label">How it will look</h2>
              <div className="seg" role="tablist" aria-label="Platform">
                {PLATFORMS.map((p) => (
                  <button key={p} role="tab" aria-selected={tab === p} onClick={() => setTab(p)}>
                    {PLATFORM_NAMES[p]}{!video.platforms[p] && ' · off'}
                  </button>
                ))}
              </div>
            </div>
            {video.seo
              ? <Preview {...props} tab={tab} seo={video.seo} pending={pending} run={run} />
              : <p className="muted" style={{ padding: 20 }}>Claude is looking at the frames and writing the titles, tags and hashtags. This takes about a minute.</p>}
          </section>

          {video.seo && <Editor key={`${video.seoAt ?? 0}-${tab}`} videoId={video.id} seo={video.seo} tab={tab} links={props.links} locked={anyLive} />}

          <InfoCard video={video} onSave={(info) => run(() => saveVideoInfo(video.id, info))} />
        </div>

        <aside className="side" style={{ gap: 20 }}>
          <section className="card" aria-labelledby="when">
            <h2 id="when">When</h2>
            <div className="when-card">
              <small>{video.slotAt && video.slotAt <= now ? 'Went live' : 'Goes live on all platforms'}</small>
              <b>{video.slotAt ? formatSlot(video.slotAt) : 'Booked after the SEO'}</b>
              {video.slotAt && video.slotAt > now && <span className="cd"><Countdown to={video.slotAt} now={now} /> · Pakistan time</span>}
            </div>
            {anyLive ? <p className="small muted">This video is live, so its time is fixed.</p> : video.slotAt && <Mover {...props} pending={pending} onMove={move} />}
          </section>

          <section className="card" aria-labelledby="where" style={{ gap: 0 }}>
            <h2 id="where" style={{ marginBottom: 8 }}>Where</h2>
            {PLATFORMS.map((p) => {
              const post = posts.find((x) => x.platform === p);
              const on = video.platforms[p];
              return (
                <div className="plat" key={p}>
                  <PlatformBadge p={p} />
                  <div style={{ minWidth: 0 }}>
                    <b>{PLATFORM_NAMES[p]}</b>
                    <div className="sub">{platformLine(p, on, post, video.slotAt, connected[p], video.shape, video.duration)}</div>
                    {post?.lastError && on && <div className="err">{post.lastError}</div>}
                    <div className="inline" style={{ marginTop: post?.url || post?.state === 'failed' ? 6 : 0 }}>
                      {post?.url && <a className="small" style={{ fontWeight: 700 }} href={post.url} target="_blank" rel="noreferrer">Open on {PLATFORM_NAMES[p]}</a>}
                      {post?.state === 'failed' && on && <button className="btn sm dark" disabled={pending} onClick={() => run(() => retry(post.id))}>Retry</button>}
                      {!connected[p] && on && <Link className="small" style={{ fontWeight: 700 }} href="/accounts">Connect</Link>}
                    </div>
                  </div>
                  <label>
                    <span className="sr-only">Post to {PLATFORM_NAMES[p]}</span>
                    <input type="checkbox" checked={on} disabled={pending || post?.state === 'live'}
                      onChange={(e) => run(() => setPlatforms(video.id, { ...video.platforms, [p]: e.target.checked }))} />
                  </label>
                </div>
              );
            })}
          </section>

          <Progress video={video} posts={posts} />
          <div>
            <ConfirmButton label="Remove video" confirmLabel="Press again to remove" onConfirm={() => run(() => deleteVideo(video.id), () => router.push('/'))} />
          </div>
        </aside>
      </div>
    </>
  );
}

function platformLine(p: Platform, on: boolean, post: PostRow | undefined, slot: number | null, connected: string | null, shape: string, duration: number | null): string {
  if (!on) return shape === 'horizontal' && (p === 'instagram' || p === 'tiktok') ? 'Off: long horizontal videos fit YouTube and Facebook best' : 'Off';
  if (post?.state === 'live') return 'Live';
  if (post?.state === 'failed') return 'Failed';
  if (!connected) return 'Not connected yet';
  if (post?.state === 'scheduled') return `Uploaded. Goes public ${slot ? formatTime(slot) : ''}`;
  if (post?.state === 'staged') return `Prepared. Posts ${slot ? formatTime(slot) : ''}`;
  if (!slot) return 'Waits for the slot';
  if (p === 'youtube' || p === 'facebook') return `Uploads ${formatSlot(slot - EARLY_UPLOAD)}, public ${formatTime(slot)}`;
  if (p === 'instagram') return `Prepared ${formatTime(slot - IG_STAGE)}, posts ${formatTime(slot)}${duration && duration > 900 ? ' · over 15 min, Instagram may refuse' : ''}`;
  return `Posts ${formatTime(slot)}`;
}

function Mover({ free, taken, now, pending, onMove, video }: Props & { pending: boolean; onMove: (ms: number) => void }) {
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number | null>(free[0] ?? null);
  const others = taken.filter((t) => t.slotAt !== video.slotAt);
  return (
    <>
      <span className="flabel">Move to</span>
      <div className="inline">
        {free.slice(0, 3).map((ms) => (
          <button key={ms} className="freechip" disabled={pending} onClick={() => onMove(ms)}>{formatSlot(ms).replace(/^(\w+) \d+ \w+ /, '$1 ')}</button>
        ))}
        <button className="btn sm" aria-expanded={picking} onClick={() => setPicking((x) => !x)}>Pick a time…</button>
      </div>
      {picking && (
        <>
          <SlotPicker value={picked} onChange={setPicked} taken={others} now={now} idPrefix="move" />
          <div><button className="btn dark sm" disabled={pending || !!slotProblem(picked, others, now)} onClick={() => picked && onMove(picked)}>Move here</button></div>
        </>
      )}
      <span className="small muted">Every move can be undone for 10 seconds.</span>
    </>
  );
}

function Preview({ video, tab, seo, thumb, customThumb, connected, channel, links, pending, run }: Props & {
  tab: Platform; seo: Seo; pending: boolean; run: (fn: () => Promise<Result>) => void;
}) {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const checks = reachChecks(tab, seo, { links, customThumb: !!customThumb });
  const done = checks.filter((c) => c.ok).length;
  const who = connected[tab] || channel || 'Your channel';
  const img = (tab === 'youtube' && customThumb) || thumb;

  async function uploadThumb(f: File) {
    if (f.size > 2 * 1024 * 1024) return toast('YouTube thumbnails must be under 2 MB.');
    setBusy(true);
    try {
      const r = await thumbnailUploadUrl(video.id, f.type);
      if (!r.ok) return toast(r.error);
      await put(r.target, f, f.type).done;
      run(() => setCustomThumb(video.id, r.key));
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const body = tab === 'youtube' || tab === 'facebook'
    ? (
      <div className="preview">
        <div className="frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img && <img src={img} alt="" />}
          {tab === 'youtube' && !customThumb && seo.youtube.thumbText && <span className="over">{seo.youtube.thumbText}</span>}
          {video.duration && <span className="len">{len(video.duration)}</span>}
        </div>
        <div className="ptitle">{tab === 'youtube' ? seo.youtube.title : seo.facebook.title}</div>
        <div className="pmeta"><span className="av" aria-hidden="true" />{who} · {tab === 'youtube' ? 'Made for kids · ' : ''}{video.slotAt ? `public ${formatSlot(video.slotAt)}` : 'not booked'}</div>
        <div className="pdesc">
          {(tab === 'youtube' ? seo.youtube.description : seo.facebook.description).trim()}
          {linksBlock(links) && <><br /><br /><span className="muted">{linksBlock(links)}</span></>}
          <br /><br /><span className="tags">{(tab === 'youtube' ? seo.youtube.hashtags : seo.facebook.hashtags).join(' ')}</span>
        </div>
        {tab === 'youtube' && (
          <div className="inline">
            <button className="btn sm" disabled={busy || pending} onClick={() => file.current?.click()}><Icon name="image" size={16} />{customThumb ? 'Change thumbnail' : 'Upload thumbnail'}</button>
            {customThumb && <button className="btn sm ghost" disabled={pending} onClick={() => run(() => removeCustomThumb(video.id))}>Remove</button>}
            <span className="small muted">JPG or PNG, 1280×720, under 2 MB. Needs a verified YouTube channel.</span>
            <input ref={file} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadThumb(f); e.target.value = ''; }} />
          </div>
        )}
      </div>
    ) : (
      <div className="preview">
        <div className="reel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumb && <img src={thumb} alt="" />}
          <div className="cap">
            <b>{who}</b>
            {(tab === 'instagram' ? seo.instagram.caption : seo.tiktok.caption).slice(0, 140)}
            {' '}<span style={{ opacity: 0.85 }}>{(tab === 'instagram' ? seo.instagram.hashtags : seo.tiktok.hashtags).slice(0, 5).join(' ')}</span>
          </div>
        </div>
      </div>
    );

  return (
    <div className="preview-wrap" style={{ padding: 20 }}>
      {body}
      <div className="checklist">
        <div className="panel-h">
          <h3 style={{ fontSize: 18 }}>Reach checklist</h3>
          <span className="score" style={{ color: done === checks.length ? 'var(--ok)' : 'var(--warn)' }}>{done} / {checks.length}</span>
        </div>
        <ul>
          {checks.map((c) => (
            <li key={c.text} className={c.ok ? 'ok' : 'fix'}>
              <Icon name={c.ok ? 'check' : 'alert'} size={18} stroke={2.6} />
              <span><span className="sr-only">{c.ok ? 'Done: ' : 'To fix: '}</span>{c.text}</span>
            </li>
          ))}
        </ul>
        {!video.platforms[tab] && <p className="small muted">{PLATFORM_NAMES[tab]} is off for this video. Turn it on under Where.</p>}
      </div>
    </div>
  );
}

function TagInput({ id, values, onChange, hashtags, readOnly }: { id: string; values: string[]; onChange: (v: string[]) => void; hashtags: boolean; readOnly: boolean }) {
  const [draft, setDraft] = useState('');
  const commit = (raw: string) => {
    const items = hashtags ? toHashtags(raw) : splitList(raw);
    const next = [...values, ...items.filter((x) => !values.includes(x))];
    if (items.length) onChange(next);
    setDraft('');
  };
  return (
    <div className="tagbox">
      {values.map((t) => (
        <span className="tag" key={t}>{t}
          {!readOnly && <button aria-label={`Remove ${t}`} onClick={() => onChange(values.filter((x) => x !== t))}>×</button>}
        </span>
      ))}
      {!readOnly && (
        <input
          id={id} value={draft} placeholder={hashtags ? 'Add a hashtag, press Enter' : 'Add a tag, press Enter'}
          onChange={(e) => (e.target.value.includes(',') ? commit(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
            if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => draft.trim() && commit(draft)}
        />
      )}
    </div>
  );
}

function Editor({ videoId, seo: initial, tab, links, locked }: { videoId: string; seo: Seo; tab: Platform; links: Links; locked: boolean }) {
  const toast = useToast();
  const [seo, setSeo] = useState(initial);
  const [state, setState] = useState<'saved' | 'saving'>('saved');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(seo);
  latest.current = seo;
  useEffect(() => () => clearTimeout(timer.current), []);

  const set = (key: string, value: string | string[]) => {
    setSeo((s) => ({ ...s, [tab]: { ...s[tab], [key]: value } }) as Seo);
    setState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveSeo(videoId, latest.current);
      if (!r.ok) toast(r.error); else setState('saved');
    }, 700);
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Select the text and press Ctrl+C'); }
  };

  const field = (f: FieldDef) => {
    const raw = (seo[tab] as Record<string, string | string[]>)[f.key];
    const use = fieldUse(raw, f);
    const id = `f-${tab}-${f.key}`;
    return (
      <div className="field" key={id}>
        <label htmlFor={id}>
          <span>{f.label.replace(', comma separated', '')}</span>
          <span className="inline" style={{ gap: 10 }}>
            <span className={`cnt ${use.over ? 'over' : ''}`}>{f.count === 'items' ? `${use.used} of ${f.max}` : `${use.used} / ${f.max}`}{use.over ? ' · too long' : ''}</span>
            <button className="link small" onClick={(e) => { e.preventDefault(); void copy(Array.isArray(raw) ? raw.join(f.key === 'hashtags' ? ' ' : ', ') : raw); }}>Copy</button>
          </span>
        </label>
        {f.kind === 'list'
          ? <TagInput id={id} values={raw as string[]} hashtags={f.key === 'hashtags'} readOnly={locked} onChange={(v) => set(f.key, v)} />
          : f.kind === 'text'
            ? <textarea className="input" id={id} value={raw as string} readOnly={locked} onChange={(e) => set(f.key, e.target.value)} />
            : <input className="input" id={id} value={raw as string} readOnly={locked} onChange={(e) => set(f.key, e.target.value)} />}
      </div>
    );
  };

  return (
    <section className="card" aria-labelledby="ed">
      <div className="panel-h">
        <h2 id="ed">{PLATFORM_NAMES[tab]} text</h2>
        <span className="small muted" role="status">{locked ? 'Live: text can no longer change' : state === 'saving' ? 'Saving…' : 'Saved · changes save as you type'}</span>
      </div>
      {FIELDS[tab].map(field)}
      {(tab === 'youtube' || tab === 'facebook') && (
        <div className="field"><span className="flabel">Added at the end when posting</span><div className="pdesc muted">{linksBlock(links) || <>No channel links yet. <Link href="/settings">Add them in Settings</Link>.</>}</div></div>
      )}
      {tab === 'youtube' && <p className="small muted">Cartoons post as made for kids, so YouTube turns comments off. Facebook and Instagram get the first comment.</p>}
    </section>
  );
}

function InfoCard({ video, onSave }: { video: VideoRow; onSave: (info: { name: string; note: string }) => void }) {
  const [name, setName] = useState(video.name);
  const [note, setNote] = useState(video.note);
  const save = () => { if (name !== video.name || note !== video.note) onSave({ name, note }); };
  return (
    <section className="card" aria-labelledby="info">
      <h2 id="info">Details</h2>
      <div className="field"><label htmlFor="vname">Video name</label><input className="input" id="vname" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} /></div>
      <div className="field"><label htmlFor="vnote">What happens in it <span className="muted" style={{ fontWeight: 400 }}>Used by Rewrite with Claude</span></label><input className="input" id="vnote" value={note} placeholder="Leo finds a magic lamp in the old bazaar" onChange={(e) => setNote(e.target.value)} onBlur={save} /></div>
      <p className="small muted">{video.fileName}</p>
    </section>
  );
}

function Progress({ video, posts }: { video: VideoRow; posts: PostRow[] }) {
  const chosen = posts.filter((p) => video.platforms[p.platform]);
  const steps: [string, boolean, string][] = [
    ['Added', true, formatSlot(video.createdAt)],
    [video.seoSource === 'claude' ? 'SEO by Claude' : 'SEO written', video.seoState === 'ready', video.seoAt ? formatSlot(video.seoAt) : 'in progress'],
    ['Early upload', chosen.some((p) => p.state === 'scheduled' || p.state === 'staged' || p.state === 'live'), video.slotAt ? formatSlot(video.slotAt - EARLY_UPLOAD) : '6 h before'],
    ['Live', chosen.length > 0 && chosen.every((p) => p.state === 'live'), video.slotAt ? formatSlot(video.slotAt) : '–'],
    ['File cleaned up', !!video.fileDeletedAt, video.fileDeletedAt ? formatSlot(video.fileDeletedAt) : 'the next morning'],
  ];
  const nowIdx = steps.findIndex((s) => !s[1]);
  return (
    <section className="card" aria-labelledby="prog">
      <h2 id="prog" className="label">Progress</h2>
      <ol className="timeline">
        {steps.map((s, i) => (
          <li key={s[0]}>
            <span className={`dot ${s[1] ? 'done' : i === nowIdx ? 'now' : ''}`} aria-hidden="true" />
            {i === nowIdx ? <b>{s[0]}</b> : <span>{s[0]}</span>}
            <span className="at">{s[2]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
