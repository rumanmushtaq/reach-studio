import { Calendar, type CalVideo } from '@/components/Calendar';
import { PLATFORM_SHORT, PLATFORMS } from '@/lib/seo';
import { studioData } from '@/lib/view';

export default async function PlannerPage() {
  const d = await studioData();
  const videos: CalVideo[] = d.videos.filter((v) => v.slotAt).map((v) => {
    const posts = d.posts.filter((p) => p.videoId === v.id);
    return {
      id: v.id, name: v.name, slotAt: v.slotAt!,
      live: posts.some((p) => p.state === 'live'),
      // Live or past its time: the slot can no longer move. Early uploads can still move (the platforms are updated).
      fixed: d.now >= v.slotAt! || posts.some((p) => p.state === 'live'),
      platforms: PLATFORMS.filter((p) => v.platforms[p]).map((p) => PLATFORM_SHORT[p]).join(' '),
    };
  });
  return <Calendar videos={videos} times={d.settings.times} now={d.now} />;
}
