import { Sk, SkHead, SkPage } from '@/components/Skeleton';

// Add videos: the drop area, then "when should they go live?".
export default function Loading() {
  return (
    <SkPage>
      <SkHead buttons={1} title={240} />
      <div className="drop sk-drop">
        <Sk w={56} h={56} />
        <Sk w={320} h={22} />
        <Sk w={260} h={12} />
      </div>
      <section className="card">
        <Sk w={210} h={12} />
        <div className="choices">{[150, 110, 130, 140].map((w, i) => <Sk key={i} w={w} h={54} />)}</div>
        <Sk w={120} h={12} />
        <Sk h={44} />
      </section>
    </SkPage>
  );
}
