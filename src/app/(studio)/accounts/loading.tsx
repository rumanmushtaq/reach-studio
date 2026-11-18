import { Sk, SkHead, SkLines, SkPage } from '@/components/Skeleton';

// Accounts: four platform cards in two columns, and the setup checklist on the right.
export default function Loading() {
  return (
    <SkPage>
      <SkHead sub title={220} />
      <div className="cols">
        <div className="main">
          <div className="grid2">
            {[0, 1, 2, 3].map((i) => (
              <section className="card acct-card" key={i}>
                <div className="top"><Sk w={36} h={36} /><Sk w="40%" h={22} /><Sk w={110} h={26} round /></div>
                <SkLines n={2} last="70%" />
                <Sk w={200} h={12} />
              </section>
            ))}
          </div>
        </div>
        <aside className="side">
          <section className="card setup">
            <div className="panel-h"><Sk w={60} h={12} /><Sk w={44} h={14} /></div>
            <Sk h={8} />
            {Array.from({ length: 7 }, (_, i) => <span key={i} className="sk-row"><Sk w={14} h={14} /><span className="sk-col" style={{ flex: 1 }}><Sk w="75%" h={13} /><Sk w="45%" h={11} /></span></span>)}
          </section>
        </aside>
      </div>
    </SkPage>
  );
}
