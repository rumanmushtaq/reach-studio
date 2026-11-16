import { LibraryView, type LibItem } from '@/components/LibraryView';
import { videoStatus } from '@/lib/plan';
import { platformChips } from '@/lib/schedule';
import { studioData } from '@/lib/view';

export default async function LibraryPage() {
  const d = await studioData();
  const items: LibItem[] = d.videos
    .map((v) => {
      const posts = d.posts.filter((p) => p.videoId === v.id);
      const status = videoStatus(v, posts, d.now);
      const chips = platformChips(v, d.posts, d.connected, d.now);
      const group: LibItem['group'] = status.tone === 'fail' || chips.some((c) => c.tone === 'warn' || c.tone === 'fail')
        ? 'attention' : status.tone === 'live' ? 'live' : 'upcoming';
      return { id: v.id, name: v.name, slotAt: v.slotAt, vertical: v.shape === 'vertical', thumb: d.thumbs[v.id], status, chips, group };
    })
    .sort((a, b) => (b.slotAt ?? Infinity) - (a.slotAt ?? Infinity));
  return <LibraryView items={items} />;
}
