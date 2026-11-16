import { UploadView } from '@/components/UploadView';
import { freeSlots, tonightSlot, weekendSlots } from '@/lib/slots';
import { studioData } from '@/lib/view';

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  const d = await studioData();
  const taken = d.videos.map((v) => v.slotAt).filter((s): s is number => !!s);
  const at = Number((await searchParams).at);
  return (
    <UploadView
      nextFree={freeSlots({ times: d.settings.times, taken, now: d.now, count: 3 })}
      tonight={tonightSlot(taken, d.now)}
      weekend={weekendSlots(d.settings.times, taken, d.now)}
      taken={d.videos.filter((v) => v.slotAt).map((v) => ({ slotAt: v.slotAt!, name: v.name }))}
      now={d.now}
      preset={Number.isFinite(at) && at > d.now ? at : null}
    />
  );
}
