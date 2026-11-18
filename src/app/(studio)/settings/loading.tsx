import { Sk, SkField, SkHead, SkLines, SkPage } from '@/components/Skeleton';

// Settings: posting times and channel on the left; Claude, sign-in and 2-step sign-in on the right.
export default function Loading() {
  return (
    <SkPage>
      <SkHead sub title={200} />
      <div className="settings-grid">
        <div className="stack">
          <section className="card">
            <Sk w={190} h={22} /><SkLines n={2} last="40%" />
            <div className="timechips">{[0, 1].map((i) => <Sk key={i} w={120} h={40} round />)}</div>
            <span className="sk-row"><Sk w={140} h={44} /><Sk w={140} h={44} /></span>
          </section>
          <section className="card">
            <Sk w={110} h={22} /><Sk w="60%" h={12} />
            <div className="grid2"><SkField /><SkField label={170} /></div>
            <Sk w={110} h={22} /><Sk w="80%" h={12} />
            <div className="grid2">{[0, 1, 2, 3].map((i) => <SkField key={i} />)}</div>
            <Sk w={80} h={44} />
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <div className="row-between"><Sk w={80} h={22} /><Sk w={100} h={26} round /></div>
            <SkLines n={3} />
            {[0, 1, 2].map((i) => <span key={i} className="sk-col" style={{ gap: 8 }}><Sk w="50%" h={14} /><Sk h={44} /></span>)}
          </section>
          <section className="card">
            <Sk w={90} h={22} /><SkLines n={2} />
            <SkField label={130} />
            <div className="grid2"><SkField /><SkField /></div>
            <Sk w={160} h={44} />
          </section>
        </div>
      </div>
    </SkPage>
  );
}
