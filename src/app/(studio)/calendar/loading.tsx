import { Sk, SkHead, SkPage } from '@/components/Skeleton';

// Planner: the week grid (times down the side, seven days across) and the key under it.
export default function Loading() {
  return (
    <SkPage>
      <SkHead sub buttons={4} title={200} />
      <div className="week">
        <div className="grid">
          <div className="dh" />
          {Array.from({ length: 7 }, (_, i) => <div className="dh" key={i}><Sk w="70%" h={12} /></div>)}
          {[0, 1].map((r) => (
            <div key={r} style={{ display: 'contents' }}>
              <div className="th"><Sk w={52} h={12} /></div>
              {Array.from({ length: 7 }, (_, i) => <div className="c" key={i}><Sk h={76} /></div>)}
            </div>
          ))}
        </div>
      </div>
      <div className="key">{[0, 1, 2, 3].map((i) => <span key={i}><Sk w={22} h={16} /><Sk w={110} h={12} /></span>)}</div>
    </SkPage>
  );
}
