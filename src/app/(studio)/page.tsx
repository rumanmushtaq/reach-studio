import { AddVideo } from '@/components/AddVideo';
import { VideoRow } from '@/components/VideoRow';
import { DAY, formatSlot, freeSlots, timeLabel } from '@/lib/slots';
import { studioData } from '@/lib/view';

export default async function VideosPage() {
  const d = await studioData();
  const forVideo = (id: string) => d.posts.filter((p) => p.videoId === id);
  const isPosted = (id: string, platforms: Record<string, boolean>) => {
    const chosen = forVideo(id).filter((p) => platforms[p.platform]);
    return chosen.length > 0 && chosen.every((p) => p.state === 'live');
  };
  const upcoming = d.videos.filter((v) => !isPosted(v.id, v.platforms)).sort((a, b) => (a.slotAt ?? 0) - (b.slotAt ?? 0));
  const posted = d.videos.filter((v) => isPosted(v.id, v.platforms)).sort((a, b) => (b.slotAt ?? 0) - (a.slotAt ?? 0));
  const taken = d.videos.map((v) => v.slotAt).filter((s): s is number => !!s);
  const free = freeSlots({ times: d.settings.times, taken, now: d.now, count: 60 });
  const weekFree = free.filter((ms) => ms < d.now + 7 * DAY).length;
  const next = upcoming.find((v) => v.slotAt && v.slotAt > d.now);
  const stored = d.videos.filter((v) => v.uploadState === 'ready' && !v.fileDeletedAt);
  const storedBytes = stored.reduce((n, v) => n + v.fileSize, 0);

  return (
    <>
      <div className="top">
        <div><h1>Videos</h1><p className="sub">Add a cartoon. SEO and a posting slot are added for you.</p></div>
      </div>
      {!d.setup.claude && (
        <div className="banner warn small">Claude is not set up yet (ANTHROPIC_API_KEY), so new videos get a basic SEO draft.</div>
      )}
      <div className="stats">
        <div className="stat"><span className="k">Next post</span><span className="v">{next ? formatSlot(next.slotAt) : 'Nothing booked'}</span><span className="small muted">{next ? next.name : 'Add a video to book one'}</span></div>
        <div className="stat"><span className="k">Next free slot</span><span className="v">{free[0] ? formatSlot(free[0]) : '–'}</span><span className="small muted">{free[1] ? `then ${formatSlot(free[1])}` : ''}</span></div>
        <div className="stat"><span className="k">Free in next 7 days</span><span className="v">{weekFree} slot{weekFree === 1 ? '' : 's'}</span><span className="small muted">Daily at {d.settings.times.map(timeLabel).join(', ')}</span></div>
      </div>
      <AddVideo nextFree={free[0] ? formatSlot(free[0]) : 'add a daily time in Settings'} />
      <div className="section-h"><h2>Coming up</h2><span className="small muted">{upcoming.length} video{upcoming.length === 1 ? '' : 's'}</span></div>
      <div className="list">
        {upcoming.length
          ? upcoming.map((v) => <VideoRow key={v.id} v={v} posts={forVideo(v.id)} thumb={d.thumbs[v.id]} now={d.now} />)
          : <div className="empty">No videos waiting. Add one above and it takes {free[0] ? formatSlot(free[0]) : 'the next free slot'}.</div>}
      </div>
      {posted.length > 0 && (
        <>
          <div className="section-h"><h2>Posted</h2><span className="small muted">{posted.length}</span></div>
          <div className="list">{posted.map((v) => <VideoRow key={v.id} v={v} posts={forVideo(v.id)} thumb={d.thumbs[v.id]} now={d.now} />)}</div>
        </>
      )}
      <div className="storage">
        <span>Storage: {stored.length} video file{stored.length === 1 ? '' : 's'}, {(storedBytes / 1024 ** 3).toFixed(2)} GB</span>
        <span>Files are deleted the day after they are live everywhere.</span>
      </div>
    </>
  );
}
