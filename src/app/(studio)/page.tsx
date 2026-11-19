import { Check, Link2, Sparkles, UploadCloud, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { AttentionBox } from '@/components/Attention';
import { Countdown, Icon, PlatformBadge, Thumb } from '@/components/ui';
import { attentionItems } from '@/lib/attention';
import { dueWork } from '@/lib/kick';
import { platformChips, scheduleDays, weekFill } from '@/lib/schedule';
import { PLATFORM_NAMES, PLATFORMS } from '@/lib/seo';
import { DAY, formatTime, freeSlots, TIME_ZONE, timeLabel } from '@/lib/slots';
import { studioData } from '@/lib/view';

const nowFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

function duration(sec: number | null) {
  return sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '';
}

export default async function TodayPage() {
  const d = await studioData();
  const postsOf = (id: string) => d.posts.filter((p) => p.videoId === id);
  const fullyLive = (id: string) => {
    const v = d.videos.find((x) => x.id === id)!;
    const chosen = postsOf(id).filter((p) => v.platforms[p.platform]);
    return chosen.length > 0 && chosen.every((p) => p.state === 'live');
  };
  const upcoming = d.videos.filter((v) => v.slotAt && v.slotAt > d.now).sort((a, b) => a.slotAt! - b.slotAt!);
  const next = upcoming[0];
  const days = scheduleDays(d.videos, d.settings.times, d.now);
  const taken = d.videos.map((v) => v.slotAt).filter((s): s is number => !!s);
  const free7 = freeSlots({ times: d.settings.times, taken, now: d.now, count: 100 }).filter((ms) => ms < d.now + 7 * DAY);
  const booked7 = upcoming.filter((v) => v.slotAt! < d.now + 7 * DAY).length;
  const posted7 = d.videos.filter((v) => v.slotAt && v.slotAt <= d.now && v.slotAt > d.now - 7 * DAY && fullyLive(v.id)).length;
  const items = attentionItems(d.videos, d.posts, d.connected, d.now);
  const late = dueWork(d).late;
  const writing = d.videos.filter((v) => v.uploadState === 'ready' && (v.seoState !== 'ready' || !!v.claudeWantedAt));
  const connectedCount = PLATFORMS.filter((p) => d.connected[p]).length;
  const steps = [
    { icon: UserPlus, title: 'Connect your accounts', text: `${connectedCount} of ${PLATFORMS.length} connected. Posts go only to connected accounts.`, href: '/accounts', action: 'Connect', done: connectedCount === PLATFORMS.length },
    { icon: UploadCloud, title: 'Add your first video', text: 'It takes the next free slot. You can move it in the planner.', href: '/upload', action: 'Add a video', done: d.videos.length > 0 },
    { icon: Sparkles, title: 'Set up Claude', text: 'Add three GitHub secrets so Claude writes the SEO.', href: '/settings', action: 'How to', done: d.setup.claude },
    { icon: Link2, title: 'Add your channel links', text: 'They go at the end of every description.', href: '/settings', action: 'Add links', done: Object.values(d.settings.links).some((l) => !!l.trim()) },
  ];
  const stepsDone = steps.filter((x) => x.done).length;

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">{nowFmt.format(new Date(d.now)).replace(',', '').toUpperCase()} PKT</span>
          <h1>{next ? <>Next post goes live <Countdown to={next.slotAt!} now={d.now} /></> : d.videos.length ? 'Nothing booked yet' : 'Welcome to Reach Studio'}</h1>
        </div>
        <div className="actions">
          <Link className="btn" href="/calendar">Open planner</Link>
          <Link className="btn primary" href="/upload"><Icon name="plus" size={18} stroke={2.4} />Add videos</Link>
        </div>
      </header>

      <AttentionBox items={items} />
      {late.length > 0 && (
        <div className="banner warn">
          <span><b>{late.length} post{late.length > 1 ? 's are' : ' is'} late.</b> The job runner that uploads and posts has not run on time. The studio is running it now; to keep it on time, set up the every-15-minutes call.</span>
          <Link className="btn sm" href="/settings#jobs">How to set it up</Link>
        </div>
      )}
      {!d.setup.claude && writing.length > 0 && <div className="banner info">{writing.length} video{writing.length > 1 ? 's are' : ' is'} waiting for Claude, which has not checked in lately. Until it does they use a basic SEO draft. <Link href="/settings">Check Claude in Settings</Link></div>}

      <div className="cols">
        <section className="main" aria-labelledby="coming">
          <div className="panel-h">
            <h2 id="coming" style={{ fontSize: 22, fontWeight: 800 }}>Coming up</h2>
            <span className="small muted">Daily at {d.settings.times.map(timeLabel).join(' and ')} · <Link href="/settings">Change</Link></span>
          </div>
          {days.length === 0 && (
            <div className="empty">
              Nothing in the next 7 days. <Link href="/upload">Add a video</Link> and it takes the next free slot.
            </div>
          )}
          <div className="days">
          {days.map((g) => (
            <div key={g.day} className="day">
              <h3 className="label day-h">{g.label}<span className="n">{g.rows.some((r) => r.kind === 'free') ? `${g.rows.filter((r) => r.kind === 'free').length} free` : 'Full'}</span></h3>
              {g.rows.map((r) => {
                const [hm, ap] = formatTime(r.at).split(' ');
                if (r.kind === 'free') {
                  return (
                    <Link key={r.at} href={`/upload?at=${r.at}`} className="slot free">
                      <span className="time"><b>{hm}</b><span>{ap}</span></span>
                      <span>Free slot</span>
                      <span style={{ fontWeight: 700 }}>Add a video</span>
                    </Link>
                  );
                }
                const v = r.video;
                const chips = platformChips(v, d.posts, d.connected, d.now);
                const live = fullyLive(v.id);
                return (
                  <Link key={v.id} href={`/videos/${v.id}`} className="slot">
                    <span className="time"><b>{hm}</b><span>{ap}{r.at > d.now && r.at - d.now < 6 * 3600_000 ? ' · soon' : ''}</span></span>
                    <Thumb url={d.thumbs[v.id]} vertical={v.shape === 'vertical'} />
                    <span style={{ minWidth: 0 }}>
                      <span className="title" style={{ display: 'block' }}>{v.name}</span>
                      <span className="chips" style={{ marginTop: 6 }}>
                        {chips.map((c) => <span key={c.platform} className={`chip ${c.tone}`}><b>{c.short}</b>{c.text}</span>)}
                      </span>
                    </span>
                    {v.seoState !== 'ready' || v.claudeWantedAt
                      ? <span className="pill seo"><span className="spin" aria-hidden="true" />Claude is writing</span>
                      : live ? <span className="pill live">Live</span>
                      : <span className="small muted">{v.shape === 'vertical' ? 'Short' : 'Long'}{v.duration ? ` · ${duration(v.duration)}` : ''}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
          </div>
          {free7.length > 0 && days.length > 0 && <p className="small muted">See every free slot in the <Link href="/calendar">planner</Link>.</p>}

          {stepsDone < steps.length && (
            <section className="start" aria-labelledby="start">
              <div className="panel-h">
                <h2 id="start" style={{ fontSize: 22, fontWeight: 800 }}>Get set up</h2>
                <span className="start-meter small muted">
                  <span className="meter" aria-hidden="true"><span style={{ width: `${(stepsDone / steps.length) * 100}%` }} /></span>
                  {stepsDone} of {steps.length} done
                </span>
              </div>
              <ol className="start-grid">
                {steps.map(({ icon: StepIcon, ...x }, i) => (
                  <li key={x.title} className={x.done ? 'done' : ''}>
                    <span className="start-icon">{x.done ? <Check size={18} aria-hidden /> : <StepIcon size={18} aria-hidden />}</span>
                    <span className="start-n mono">{x.done ? 'Done' : `Step ${i + 1}`}</span>
                    <h3>{x.title}</h3>
                    <p className="small muted">{x.text}</p>
                    {!x.done && <Link className="btn sm" href={x.href}>{x.action}</Link>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </section>

        <aside className="side">
          <section className="card" aria-labelledby="week">
            <h2 id="week" className="label">Next 7 days</h2>
            <div className="stat3">
              <div><b>{posted7}</b><span className="small muted">posted last week</span></div>
              <div><b>{booked7}</b><span className="small muted">booked</span></div>
              <div><b style={{ color: 'var(--ok)' }}>{free7.length}</b><span className="small muted">free slots</span></div>
            </div>
            <div className="week7" role="img" aria-label="How full each of the next 7 days is">
              {weekFill(d.videos, d.settings.times, d.now).map((w) => <span key={w.day} className={`cell ${w.fill === 'full' ? '' : w.fill}`} />)}
            </div>
            <div className="week7" aria-hidden="true">
              {weekFill(d.videos, d.settings.times, d.now).map((w) => <span key={w.day} className="d">{w.label}</span>)}
            </div>
          </section>

          <section className="card" aria-labelledby="acc" style={{ gap: 8 }}>
            <h2 id="acc" className="label">Accounts</h2>
            {PLATFORMS.map((p) => (
              <div className="acct-row" key={p}>
                <PlatformBadge p={p} small />
                <span className="n">{d.connected[p] ?? PLATFORM_NAMES[p]}</span>
                {d.connected[p] ? <span className="ok-t">Connected</span> : <Link className="small" style={{ fontWeight: 700 }} href="/accounts">Connect</Link>}
              </div>
            ))}
          </section>

          {writing.length > 0 && (
            <section className="card" aria-labelledby="writing" style={{ gap: 8 }}>
              <h2 id="writing" className="label">Claude is writing</h2>
              {writing.map((v) => <Link key={v.id} href={`/videos/${v.id}`} className="small">{v.name}</Link>)}
            </section>
          )}

          {free7.length > 0 && (
            <section className="navy-card" aria-labelledby="streak">
              <h2 id="streak" className="label">Keep the streak</h2>
              <p>{free7.length} free slot{free7.length > 1 ? 's' : ''} in the next 7 days. Posting on a steady schedule keeps viewers coming back.</p>
              <Link href="/upload">Fill this week</Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
