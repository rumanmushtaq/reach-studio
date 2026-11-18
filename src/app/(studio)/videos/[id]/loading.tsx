import { Sk, SkLines, SkPage } from '@/components/Skeleton';

// One video: preview with platform tabs and the SEO editor; when and where it posts on the right.
export default function Loading() {
  return (
    <SkPage>
      <header className="vhead"><Sk w={100} h={44} /><span className="sk-col" style={{ flex: 1 }}><Sk w="45%" h={32} /><Sk w="30%" h={12} /></span></header>
      <div className="cols side-first">
        <div className="main" style={{ gap: 20 }}>
          <section className="card" style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
            <div className="panel-h" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-2)' }}>
              <Sk w={80} h={14} />
              <span className="seg">{[0, 1, 2, 3].map((i) => <Sk key={i} w={74} h={30} />)}</span>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Sk h="auto" style={{ aspectRatio: '16 / 9' }} />
              <Sk w="70%" h={18} />
              <SkLines n={3} />
            </div>
          </section>
          <section className="card">
            <Sk w={140} h={22} />
            <Sk h={44} />
            <Sk h={120} />
            <Sk w="50%" h={12} />
          </section>
        </div>
        <aside className="side" style={{ gap: 20 }}>
          <section className="card"><Sk w={100} h={12} /><Sk h={86} /><Sk w={160} h={44} /></section>
          <section className="card" style={{ gap: 12 }}>
            <Sk w={100} h={12} />
            {[0, 1, 2, 3].map((i) => <span key={i} className="sk-row"><Sk w={36} h={36} /><span className="sk-col" style={{ flex: 1 }}><Sk w="50%" h={13} /><Sk w="35%" h={11} /></span><Sk w={40} h={22} round /></span>)}
          </section>
        </aside>
      </div>
    </SkPage>
  );
}
