import { AutoRefresh, BottomBar, Rail, ToastProvider, type NavInfo } from '@/components/ui';
import { attentionItems } from '@/lib/attention';
import { videoStatus } from '@/lib/plan';
import { PLATFORMS } from '@/lib/seo';
import { kickJobs } from '@/lib/kick';
import { freeStorageBytes } from '@/lib/storage';
import { studioData } from '@/lib/view';

export const dynamic = 'force-dynamic';
// Room for the background job run that opening the studio can start (see kickJobs).
export const maxDuration = 300;

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const d = await studioData();
  kickJobs(d);
  const stored = d.videos.filter((v) => !v.fileDeletedAt).reduce((n, v) => n + v.fileSize, 0);
  const free = freeStorageBytes();
  const info: NavInfo = {
    attention: attentionItems(d.videos, d.posts, d.connected, d.now).length,
    videos: d.videos.length,
    accountsOff: PLATFORMS.filter((p) => !d.connected[p]).length,
    storage: `${(stored / 1024 ** 3).toFixed(1)} GB of ${free / 1024 ** 3} GB`,
    storagePct: Math.min(100, (stored / free) * 100),
  };
  const busy = d.videos.some((v) => videoStatus(v, d.posts.filter((p) => p.videoId === v.id), d.now).busy);
  return (
    <ToastProvider>
      <div className="app">
        <Rail info={info} />
        <main className="page">{children}</main>
      </div>
      <BottomBar info={info} />
      <AutoRefresh active={busy} />
      <AutoRefresh active={!busy} everyMs={60_000} />
    </ToastProvider>
  );
}
