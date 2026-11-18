import { Sk, SkHead, SkPage } from '@/components/Skeleton';

// Library: filter tabs and search, then one row per video.
export default function Loading() {
  return (
    <SkPage>
      <SkHead buttons={1} title={180} />
      <div className="panel-h">
        <span className="seg">{[0, 1, 2, 3].map((i) => <Sk key={i} w={88} h={30} />)}</span>
        <Sk w={300} h={44} />
      </div>
      <div className="sk-col" style={{ gap: 8 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <span className="lib-row" key={i}>
            <Sk w={64} h={40} />
            <span className="sk-col"><Sk w="55%" h={14} /><Sk w="35%" h={11} /></span>
            <span className="when"><Sk w={150} h={12} /></span>
            <Sk w={96} h={28} round />
          </span>
        ))}
      </div>
    </SkPage>
  );
}
