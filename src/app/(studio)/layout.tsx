import { AutoRefresh, Rail, ToastProvider } from '@/components/ui';
import { videoStatus } from '@/lib/plan';
import { freeSlots, DAY } from '@/lib/slots';
import { PLATFORMS } from '@/lib/seo';
import { studioData } from '@/lib/view';

export const dynamic = 'force-dynamic';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const d = await studioData();
  const taken = d.videos.map((v) => v.slotAt).filter((s): s is number => !!s);
  const weekFree = freeSlots({ times: d.settings.times, taken, now: d.now, count: 60 }).filter((ms) => ms < d.now + 7 * DAY).length;
  const off = PLATFORMS.filter((p) => !d.connected[p]).length;
  const busy = d.videos.some((v) => videoStatus(v, d.posts.filter((p) => p.videoId === v.id), d.now).busy);
  return (
    <ToastProvider>
      <div className="shell">
        <Rail counts={{ videos: d.videos.length ? String(d.videos.length) : '', free: weekFree ? String(weekFree) : '', accounts: off ? `${off} off` : '' }} />
        <main>{children}</main>
      </div>
      <AutoRefresh active={busy} />
      <AutoRefresh active={!busy} everyMs={60_000} />
    </ToastProvider>
  );
}
