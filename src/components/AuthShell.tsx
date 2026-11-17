import { CalendarClock, Sparkles, UploadCloud } from 'lucide-react';
import type { ReactNode } from 'react';

// Frame for every sign-in page: on wide screens a brand panel on the left shows what the studio does;
// on phones only the card shows, over the same soft background.

const POINTS = [
  { icon: UploadCloud, title: 'Upload once', text: 'Add a cartoon from your computer or Cloudinary.' },
  { icon: Sparkles, title: 'Claude writes the SEO', text: 'Titles, descriptions and tags for each platform.' },
  { icon: CalendarClock, title: 'Posted on time', text: 'One daily slot, sent to every account for you.' },
];

const QUEUE = [
  { name: 'YouTube', dot: '#FF5A4F', time: '6:00 PM', posted: true },
  { name: 'Facebook', dot: '#6E8DFF', time: '6:15 PM', posted: true },
  { name: 'Instagram', dot: '#F35BAE', time: '7:00 PM', posted: false },
  { name: 'TikTok', dot: '#E9ECF7', time: '8:30 PM', posted: false },
];

export function AuthShell({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-story">
        <div className="story-brand"><span className="logo">R</span><span>Reach Studio</span></div>
        <div className="story-copy">
          <h2>One upload.<br /><em>Every platform.</em><br />On time.</h2>
          <ul className="story-points">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="story-icon"><Icon size={18} aria-hidden /></span>
                <span><strong>{title}</strong><span>{text}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="story-queue" aria-hidden>
          <p className="story-queue-head"><span>Tonight&apos;s cartoon</span><span className="mono">4 posts</span></p>
          {QUEUE.map((q) => (
            <div className="story-row" key={q.name}>
              <span className="story-dot" style={{ background: q.dot }} />
              <span className="story-name">{q.name}</span>
              <span className="mono story-time">{q.time}</span>
              <span className={`story-state ${q.posted ? 'done' : ''}`}>{q.posted ? 'Posted' : 'Queued'}</span>
            </div>
          ))}
        </div>
      </aside>
      <main className={wide ? 'login wide' : 'login'}>{children}</main>
    </div>
  );
}
