import Link from 'next/link';
import { VideoDetail } from '@/components/VideoDetail';
import { freeSlots } from '@/lib/slots';
import { studioData } from '@/lib/view';

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await studioData();
  const video = d.videos.find((v) => v.id === id);
  if (!video) return <div className="empty">This video was removed. <Link className="btn sm" href="/">Back to videos</Link></div>;
  const taken = d.videos.map((v) => v.slotAt).filter((s): s is number => !!s);
  return (
    <VideoDetail
      video={video}
      posts={d.posts.filter((p) => p.videoId === id)}
      thumb={d.thumbs[id]}
      free={freeSlots({ times: d.settings.times, taken, now: d.now, count: 21 })}
      taken={d.videos.filter((v) => v.slotAt).map((v) => ({ slotAt: v.slotAt!, name: v.name }))}
      now={d.now}
      connected={d.connected}
      links={d.settings.links}
    />
  );
}
