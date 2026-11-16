import { localSignIn } from '../actions';
import { has } from '@/lib/env';
import { localSignInAllowed } from '@/lib/google-login';

const ERRORS: Record<string, string> = {
  'not-owner': 'That Google account is not allowed. Sign in with an account listed in OWNER_EMAILS.',
  cancelled: 'Sign-in was cancelled.',
  expired: 'Sign-in took too long. Try again.',
  google: 'Google sign-in failed. Try again.',
  setup: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (see README).',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const local = localSignInAllowed();
  return (
    <main className="login">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="logo">R</span><h1 style={{ fontSize: 24, fontWeight: 800 }}>Reach Studio</h1></div>
        <p className="small muted">Your cartoons, scheduled everywhere.</p>
        {error && <p className="err" role="alert">{ERRORS[error] ?? 'Sign-in failed. Try again.'}</p>}
        {has.google() ? (
          <a className="btn primary" href="/api/auth/google/start">Continue with Google</a>
        ) : !local && <p className="small muted">{ERRORS.setup}</p>}
        {local && (
          <form action={localSignIn}>
            <button className="btn" style={{ width: '100%' }}>Enter studio (local only)</button>
            <p className="small muted" style={{ marginTop: 8 }}>Google sign-in is not set up on this laptop. The deployed studio always asks for Google.</p>
          </form>
        )}
      </div>
    </main>
  );
}
