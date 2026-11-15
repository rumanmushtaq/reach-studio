import Link from 'next/link';
import type { PostRow, VideoRow as Video } from '@/lib/db/schema';
import { videoStatus } from '@/lib/plan';
import { PLATFORM_NAMES, PLATFORM_SHORT, PLATFORMS } from '@/lib/seo';
import { formatSlot } from '@/lib/slots';
import { Pill, Thumb } from './ui';

export function duration(sec: number | null): string {
  if (!sec) return '–';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

export function VideoRow({ v, posts, thumb, now }: { v: Video; posts: PostRow[]; thumb?: string; now: number }) {
  return (
    <Link className="vrow" href={`/videos/${v.id}`}>
      <Thumb url={thumb} vertical={v.shape === 'vertical'} />
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span className="t">{v.name}</span>
        <span className="m">
          <span className="mono">{formatSlot(v.slotAt)}</span>
          <span>{duration(v.duration)}</span>
          <span className="plats">
            {PLATFORMS.map((p) => (
              <span key={p} className={`pdot ${v.platforms[p] ? 'on' : ''}`} title={PLATFORM_NAMES[p]}>{PLATFORM_SHORT[p]}</span>
            ))}
          </span>
        </span>
      </span>
      <Pill status={videoStatus(v, posts, now)} />
    </Link>
  );
}
