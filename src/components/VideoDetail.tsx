'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import {
  deleteVideo, removeCustomThumb, retry, rewriteSeo, saveSeo, saveVideoInfo, setCustomThumb, setPlatforms, thumbnailUploadUrl,
} from '@/app/actions';
import { put } from '@/lib/browser-video';
import type { PostRow, VideoRow } from '@/lib/db/schema';
import { videoInfoSchema, type VideoInfoForm } from '@/lib/forms';
import { videoStatus } from '@/lib/plan';
import { reachChecks } from '@/lib/reach';
import { FIELDS, fieldUse, linksBlock, PLATFORM_NAMES, PLATFORMS, SeoSchema, splitList, toHashtags, type FieldDef, type Links, type Platform, type Research, type Seo } from '@/lib/seo';
import { EARLY_UPLOAD, formatSlot, formatTime, IG_STAGE, slotProblem } from '@/lib/slots';
import { applyResult, Field, TextInput } from './forms';
import { useAction, useMoveSlot } from './query';
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
  const { run, pending: acting } = useAction();
  const claude = useAction();
  const { move: moveVideo, pending: moving } = useMoveSlot();
  const pending = acting || moving;
  const toast = useToast();
  // Where to post: the ticks change at once and stay until the page has the saved data, so they never
  // flick back to the old value between the save and the reload.
  const [reloading, startReload] = useTransition();
  const toggle = useMutation({
    mutationFn: (platforms: Record<Platform, boolean>) => setPlatforms(video.id, platforms),
    onSuccess: (r) => toast(r.ok ? 'Saved' : r.error ?? 'Could not save'),
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not save'),
    onSettled: () => startReload(() => router.refresh()),
  });
  const saving = toggle.isPending || reloading;
  const shownPlatforms = saving && toggle.variables && toggle.data?.ok !== false ? toggle.variables : video.platforms;
  const [tab, setTab] = useState<Platform>(PLATFORMS.find((p) => video.platforms[p]) ?? 'youtube');
  const status = videoStatus(video, posts, now);
  const anyLive = posts.some((p) => p.state === 'live');
  const writing = video.seoState !== 'ready' || !!video.claudeWantedAt;
  // Once a platform has the video, its text there is fixed, so Claude has nothing left to change.
  const sent = posts.some((p) => p.state !== 'waiting' || !!p.externalId);

  const move = (to: number) => moveVideo(video.id, to, { name: video.name, from: video.slotAt });

  return (
    <>
      <header className="vhead">
        <Link className="btn" href="/"><Icon name="back" size={16} stroke={2.4} />Today</Link>
        <div className="t">
          <h1>{video.name}</h1>
          <div className="small muted">
            {video.shape === 'vertical' ? 'Vertical' : 'Horizontal'}{video.duration ? ` · ${len(video.duration)}` : ''} · added {formatSlot(video.createdAt)}
            {video.seoAt ? ` · SEO ${video.seoSource === 'claude' ? `by Claude, ${formatSlot(video.seoAt)}` : 'basic draft'}` : ''}
            {video.fileDeletedAt ? ' · file cleaned up after posting' : ''}
          </div>
        </div>
        <Pill status={status} />
        <button
          className="btn" disabled={writing || pending || claude.pending || anyLive || sent} onClick={() => claude.run(() => rewriteSeo(video.id))}
          title={sent ? 'Already uploaded, so its text no longer changes' : undefined}
        >
          {writing || claude.pending
            ? <><span className="spin" aria-hidden="true" />{claude.pending ? 'Sending to Claude…' : 'Waiting for Claude…'}</>
            : <><Icon name="spark" size={16} />Rewrite with Claude</>}
        </button>
      </header>

      {video.uploadState === 'uploading' && <div className="banner warn">This upload did not finish. Remove the video and add it again.</div>}
      {video.seoNote && <div className="banner warn">{video.seoNote}</div>}
      {video.claudeWantedAt && (sent
        ? <div className="banner warn"><span>This video is already uploaded, so Claude can no longer change its text there. The text below stays.</span></div>
        : <div className="banner info"><span>Claude is writing this SEO on GitHub, usually within a few minutes. Until then the basic draft below is used, and your own edits cancel the rewrite.</span></div>)}

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

          {video.research && <ResearchCard research={video.research} />}

          <InfoCard key={`${video.name}|${video.note}`} video={video} />
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
              const on = shownPlatforms[p];
              return (
                <div className="plat" key={p}>
                  <PlatformBadge p={p} />
                  <div style={{ minWidth: 0 }}>
                    <b>{PLATFORM_NAMES[p]}</b>
                    <div className="sub">{platformLine(p, on, post, video.slotAt, connected[p], video.shape, video.duration)}</div>
                    {post?.lastError && on && connected[p] && <div className="err">{post.lastError}</div>}
                    <div className="inline" style={{ marginTop: post?.url || post?.state === 'failed' ? 6 : 0 }}>
                      {post?.url && <a className="small" style={{ fontWeight: 700 }} href={post.url} target="_blank" rel="noreferrer">Open on {PLATFORM_NAMES[p]}</a>}
                      {post?.state === 'failed' && on && connected[p] && <button className="btn sm dark" disabled={pending} onClick={() => run(() => retry(post.id))}>Retry</button>}
                      {!connected[p] && on && <Link className="small" style={{ fontWeight: 700 }} href="/accounts">Connect</Link>}
                    </div>
                  </div>
                  <label>
                    <span className="sr-only">Post to {PLATFORM_NAMES[p]}</span>
                    <input type="checkbox" checked={on} disabled={pending || saving || post?.state === 'live' || (on && post?.state === 'scheduled')}
                      onChange={(e) => toggle.mutate({ ...shownPlatforms, [p]: e.target.checked })} />
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
  // Posts for a platform that is not connected wait for it, so connecting it is all that is needed.
  if (!connected) return slot && slot <= now() ? 'Not connected · connect it to post now, or untick it' : 'Not connected · posts once you connect it';
  if (post?.state === 'failed') return 'Failed';
  if (post?.state === 'scheduled') return `Uploaded. Goes public ${slot ? formatTime(slot) : ''} · already on ${PLATFORM_NAMES[p]}, so it stays ticked`;
  if (post?.state === 'staged') return `Prepared. Posts ${slot ? formatTime(slot) : ''}`;
  if (!slot) return 'Waits for the slot';
  // The post's own run time, not the plan: a video added late uploads when it is added, not 6 hours early.
  const runAt = post?.runAt ?? (p === 'youtube' || p === 'facebook' ? slot - EARLY_UPLOAD : p === 'instagram' ? slot - IG_STAGE : slot);
  if (post && post.state === 'waiting' && runAt <= now()) return `${p === 'tiktok' ? 'Posting' : p === 'instagram' ? 'Preparing' : 'Uploading'} is due now · waiting for the job runner`;
  if (p === 'youtube' || p === 'facebook') return `Uploads ${formatSlot(runAt)}, public ${formatTime(slot)}`;
  if (p === 'instagram') return `Prepared ${formatSlot(runAt)}, posts ${formatTime(slot)}${duration && duration > 900 ? ' · over 15 min, Instagram may refuse' : ''}`;
  return `Posts ${formatSlot(slot)}`;
}

const now = () => Date.now();

function Mover({ free, taken, now, pending, onMove, video }: Props & { pending: boolean; onMove: (ms: number) => void }) {
  const [picking, setPicking] = useState(false); // whether the picker is open; the picked time lives in the form
  const others = taken.filter((t) => t.slotAt !== video.slotAt);
  const form = useForm<{ at: number | null }>({ defaultValues: { at: free[0] ?? null } });
  const at = useWatch({ control: form.control, name: 'at' });
  const submit = form.handleSubmit((v) => { if (v.at && !slotProblem(v.at, others, now)) onMove(v.at); });
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
        <form onSubmit={submit} style={{ display: 'contents' }}>
          <Controller control={form.control} name="at" render={({ field }) => (
            <SlotPicker value={field.value} onChange={field.onChange} taken={others} now={now} idPrefix="move" />
          )} />
          <div><button className="btn dark sm" disabled={pending || !!slotProblem(at, others, now)}>Move here</button></div>
        </form>
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
  // Get a signed upload link, send the image there, then attach it to the video.
  const thumbUpload = useMutation({
    mutationFn: async (f: File) => {
      const r = await thumbnailUploadUrl(video.id, f.type);
      if (!r.ok) throw new Error(r.error);
      await put(r.target, f, f.type).done;
      return r.key;
    },
    onSuccess: (key) => run(() => setCustomThumb(video.id, key)),
    onError: (err) => toast(err instanceof Error ? err.message : 'The image did not upload.'),
  });
  const busy = thumbUpload.isPending;
  const checks = reachChecks(tab, seo, { links, customThumb: !!customThumb });
  const done = checks.filter((c) => c.ok).length;
  const who = connected[tab] || channel || 'Your channel';
  const img = (tab === 'youtube' && customThumb) || thumb;

  function uploadThumb(f: File) {
    if (f.size > 2 * 1024 * 1024) return toast('YouTube thumbnails must be under 2 MB.');
    thumbUpload.mutate(f);
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

/** Tags as chips. The list is the form's value; the half-typed tag stays in the input box itself. */
function TagInput({ id, values, onChange, hashtags, readOnly }: { id: string; values: string[]; onChange: (v: string[]) => void; hashtags: boolean; readOnly: boolean }) {
  const box = useRef<HTMLInputElement>(null);
  const commit = () => {
    const el = box.current;
    if (!el) return;
    const items = hashtags ? toHashtags(el.value) : splitList(el.value);
    if (items.length) onChange([...values, ...items.filter((x) => !values.includes(x))]);
    el.value = '';
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
          ref={box} id={id} placeholder={hashtags ? 'Add a hashtag, press Enter' : 'Add a tag, press Enter'}
          onChange={(e) => { if (e.target.value.includes(',')) commit(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Backspace' && !e.currentTarget.value && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={(e) => { if (e.target.value.trim()) commit(); }}
        />
      )}
    </div>
  );
}

function Editor({ videoId, seo: initial, tab, links, locked }: { videoId: string; seo: Seo; tab: Platform; links: Links; locked: boolean }) {
  const toast = useToast();
  const form = useForm<Seo>({ resolver: zodResolver(SeoSchema), defaultValues: initial });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [waiting, setWaiting] = useState(false); // typed, not sent yet (save status, not form data)
  const save = useMutation({
    mutationFn: (seo: Seo) => saveSeo(videoId, seo),
    onSuccess: (r) => { if (!r.ok) toast(r.error); },
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not save'),
  });
  const saving = waiting || save.isPending;
  const saveNow = save.mutate; // stable between renders, so the effect below subscribes once

  // Changes save on their own, 0.7 s after the last keystroke.
  useEffect(() => {
    const sub = form.watch(() => {
      setWaiting(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { setWaiting(false); saveNow(form.getValues()); }, 700);
    });
    return () => { sub.unsubscribe(); clearTimeout(timer.current); };
  }, [form, saveNow]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Select the text and press Ctrl+C'); }
  };

  return (
    <form className="card" aria-labelledby="ed" onSubmit={(e) => e.preventDefault()} noValidate>
      <div className="panel-h">
        <h2 id="ed">{PLATFORM_NAMES[tab]} text</h2>
        <span className="small muted" role="status">{locked ? 'Live: text can no longer change' : saving ? 'Saving…' : 'Saved · changes save as you type'}</span>
      </div>
      {FIELDS[tab].map((f) => <SeoField key={f.key} f={f} tab={tab} control={form.control} locked={locked} copy={copy} />)}
      {(tab === 'youtube' || tab === 'facebook') && (
        <div className="field"><span className="flabel">Added at the end when posting</span><div className="pdesc muted">{linksBlock(links) || <>No channel links yet. <Link href="/settings">Add them in Settings</Link>.</>}</div></div>
      )}
      {tab === 'youtube' && <p className="small muted">Cartoons post as made for kids, so YouTube turns comments off. Facebook and Instagram get the first comment.</p>}
    </form>
  );
}

function SeoField({ f, tab, control, locked, copy }: { f: FieldDef; tab: Platform; control: Control<Seo>; locked: boolean; copy: (t: string) => void }) {
  const id = `f-${tab}-${f.key}`;
  return (
    <Controller control={control} name={`${tab}.${f.key}` as `youtube.title`} render={({ field }) => {
      const raw = field.value as string | string[];
      const use = fieldUse(raw, f);
      return (
        <div className="field">
          <label htmlFor={id}>
            <span>{f.label.replace(', comma separated', '')}</span>
            <span className="inline" style={{ gap: 10 }}>
              <span className={`cnt ${use.over ? 'over' : ''}`}>{f.count === 'items' ? `${use.used} of ${f.max}` : `${use.used} / ${f.max}`}{use.over ? ' · too long' : ''}</span>
              <button type="button" className="link small" onClick={() => copy(Array.isArray(raw) ? raw.join(f.key === 'hashtags' ? ' ' : ', ') : raw)}>Copy</button>
            </span>
          </label>
          {f.kind === 'list'
            ? <TagInput id={id} values={raw as string[]} hashtags={f.key === 'hashtags'} readOnly={locked} onChange={field.onChange} />
            : f.kind === 'text'
              ? <textarea className="input" id={id} readOnly={locked} name={field.name} ref={field.ref} value={raw as string} onChange={field.onChange} onBlur={field.onBlur} />
              : <input className="input" id={id} readOnly={locked} name={field.name} ref={field.ref} value={raw as string} onChange={field.onChange} onBlur={field.onBlur} />}
        </div>
      );
    }} />
  );
}

function ResearchCard({ research }: { research: Research }) {
  const list = (title: string, items: string[]) => items.length > 0 && (
    <div className="field">
      <span className="flabel">{title}</span>
      <div className="tagbox">{items.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
    </div>
  );
  return (
    <section className="card" aria-labelledby="research">
      <h2 id="research">Market research by Claude</h2>
      {research.notes && <p className="small">{research.notes}</p>}
      {list('What people search now', research.searchTerms)}
      {list('Trending hashtags', research.hashtags)}
      {list('Channels compared', research.channels)}
    </section>
  );
}

function InfoCard({ video }: { video: VideoRow }) {
  const router = useRouter();
  const form = useForm<VideoInfoForm>({ resolver: zodResolver(videoInfoSchema), defaultValues: { name: video.name, note: video.note } });
  const saveInfo = useMutation({ mutationFn: (v: VideoInfoForm) => saveVideoInfo(video.id, v) });
  const e = form.formState.errors;
  // Saves when a field loses focus, if it changed.
  const save = form.handleSubmit(async (v) => {
    if (!form.formState.isDirty) return;
    if (applyResult(form, await saveInfo.mutateAsync(v))) router.refresh();
  });
  return (
    <form className="card" aria-labelledby="info" onSubmit={save} noValidate>
      <h2 id="info">Details</h2>
      <Field id="vname" label="Video name" error={e.name}><TextInput form={form} name="name" id="vname" onBlur={() => void save()} /></Field>
      <Field id="vnote" label="What happens in it" hint="Used by Rewrite with Claude" error={e.note}>
        <TextInput form={form} name="note" id="vnote" placeholder="Leo finds a magic lamp in the old bazaar" onBlur={() => void save()} />
      </Field>
      <p className="small muted">{video.fileName}</p>
    </form>
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
