import { AuthShell } from './AuthShell';

/** Shown on the sign-in pages when Supabase is not set up or cannot be reached. */
export function AuthProblem({ text, detail }: { text: string; detail?: string }) {
  return (
    <AuthShell>
      <div className="card auth-card">
        <div className="auth-head">
          <div className="auth-brand"><span className="logo">R</span><span>Reach Studio</span></div>
          <h1>Sign-in is not ready</h1>
        </div>
        <p className="banner bad" role="alert">{text}</p>
        {detail && <p className="small mono">{detail}</p>}
        <p className="small muted">Fix the setting in Vercel (Settings → Environment Variables), then redeploy. The README lists every setting.</p>
      </div>
    </AuthShell>
  );
}

/** The detail line for missing Supabase settings: names only, never values. */
export function missingConfigProblem(seen: string[], missing: string[]) {
  return `Missing: ${missing.join(', ') || 'none'}. Supabase settings this deployment can see: ${seen.join(', ') || 'none'}. Check the names, and that "Production" is ticked for each.`;
}
