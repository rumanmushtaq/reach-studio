// Shown the moment you open another page, while the server gets its data.
export default function Loading() {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      <div className="head">
        <div className="sk-col">
          <span className="sk sk-line" style={{ width: 160 }} />
          <span className="sk sk-title" />
        </div>
        <span className="sk sk-btn" />
      </div>
      <div className="cols">
        <div className="main">
          {[0, 1, 2].map((i) => <span key={i} className="sk sk-card" />)}
        </div>
        <div className="side">
          <span className="sk sk-card tall" />
          <span className="sk sk-card" />
        </div>
      </div>
    </div>
  );
}
