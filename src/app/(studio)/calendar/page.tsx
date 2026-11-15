import { Calendar, type CalVideo } from '@/components/Calendar';
import { studioData } from '@/lib/view';

export default async function CalendarPage() {
  const d = await studioData();
  const videos: CalVideo[] = d.videos.filter((v) => v.slotAt).map((v) => {
    const posts = d.posts.filter((p) => p.videoId === v.id);
    return {
      id: v.id, name: v.name, slotAt: v.slotAt!,
      live: posts.some((p) => p.state === 'live'),
      locked: d.now >= v.slotAt!,
    };
  });
  return <Calendar videos={videos} times={d.settings.times} now={d.now} />;
}
