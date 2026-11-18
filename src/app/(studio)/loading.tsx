import { Sk, SkHead, SkLines, SkPage } from '@/components/Skeleton';

// Today: "coming up" days on the left; next 7 days, accounts and the streak card on the right.
export default function Loading() {
  return (
    <SkPage>
      <SkHead eyebrow buttons={2} title={420} />
      <div className="cols">
        <section className="main">
          <div className="panel-h"><Sk w={150} h={26} /><Sk w={190} h={12} /></div>
          <div className="days">
            {[0, 1, 2].map((d) => (
              <div className="day" key={d}>
                <div className="day-h"><Sk w={130} h={12} /><Sk w={46} h={12} /></div>
                <span className="sk-slot"><Sk w={44} h={30} /><Sk w="40%" h={12} /><Sk w={78} h={12} /></span>
                <span className="sk-slot"><Sk w={44} h={30} /><Sk w="40%" h={12} /><Sk w={78} h={12} /></span>
              </div>
            ))}
          </div>
        </section>
        <aside className="side">
          <section className="card">
            <Sk w={110} h={12} />
            <div className="stat3">{[0, 1, 2].map((i) => <span key={i} className="sk-col"><Sk w={36} h={30} /><Sk w="80%" h={11} /></span>)}</div>
            <div className="week7">{Array.from({ length: 7 }, (_, i) => <Sk key={i} h={34} />)}</div>
          </section>
          <section className="card" style={{ gap: 12 }}>
            <Sk w={90} h={12} />
            {[0, 1, 2, 3].map((i) => <span key={i} className="sk-row"><Sk w={28} h={28} /><Sk w="45%" h={12} /><Sk w={56} h={12} style={{ marginLeft: 'auto' }} /></span>)}
          </section>
          <section className="card"><Sk w={120} h={12} /><SkLines n={3} /></section>
        </aside>
      </div>
    </SkPage>
  );
}
