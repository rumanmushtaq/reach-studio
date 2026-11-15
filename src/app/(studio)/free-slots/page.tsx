import { FreeSlots } from '@/components/FreeSlots';
import { freeSlots } from '@/lib/slots';
import { studioData } from '@/lib/view';

export default async function FreeSlotsPage() {
  const d = await studioData();
  const taken = d.videos.map((v) => v.slotAt).filter((s): s is number => !!s);
  const movable = d.videos
    .filter((v) => v.seoState === 'ready' && v.slotAt && v.slotAt > d.now && !d.posts.some((p) => p.videoId === v.id && p.state === 'live'))
    .map((v) => ({ id: v.id, name: v.name, slotAt: v.slotAt }));
  return <FreeSlots free={freeSlots({ times: d.settings.times, taken, now: d.now, count: 14 })} movable={movable} />;
}
