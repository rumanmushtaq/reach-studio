import { AuthProblem, missingConfigProblem } from '@/components/AuthProblem';
import { SignInView, type Notice } from '@/components/SignInView';
import { codePending, MISSING_CONFIG, supabaseConfig, supabaseSettingNames } from '@/lib/supabase/config';
import { ownerExists } from '@/lib/supabase/owner';
import { currentOwner } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Why the browser was sent here, in plain words.
const REASONS: Record<string, Notice> = {
  exists: { tone: 'info', text: 'Your account already exists. Sign in with it.' },
  'no-account': { tone: 'info', text: 'This studio has no account yet. Create one first.' },
  'password-changed': { tone: 'good', text: 'Password changed. Sign in with your new password. Other devices are signed out within the hour.' },
  'auth-error': { tone: 'bad', text: 'The studio could not check your sign-in with Supabase. Sign in again; if this keeps happening, check the Supabase settings.' },
  'signed-out': { tone: 'info', text: 'You signed out.' },
  expired: { tone: 'info', text: 'Your session ended. Sign in again.' },
  'not-owner': { tone: 'bad', text: 'That account does not own this studio. Sign in with the owner email.' },
  'link-expired': { tone: 'bad', text: 'That email link has expired or was already used. Ask for a new one.' },
  'link-failed': { tone: 'bad', text: 'That email link did not work. Ask for a new one.' },
  confirmed: { tone: 'good', text: 'Email confirmed. Sign in with your email and password.' },
  'other-browser': { tone: 'bad', text: 'Open the email link in the same browser where you asked for it, or ask for a new link here.' },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ exists?: string; reason?: string }> }) {
  const q = await searchParams;
  if (!supabaseConfig()) {
    const { seen, missing } = supabaseSettingNames();
    return <AuthProblem text={MISSING_CONFIG} detail={missingConfigProblem(seen, missing)} />;
  }
  let firstRun: boolean;
  try {
    firstRun = !(await ownerExists());
  } catch (e) {
    return <AuthProblem text={`The studio cannot read Supabase Auth through SUPABASE_DATABASE_URL: ${e instanceof Error ? e.message : String(e)}`} />;
  }
  // Signed in with the password but 2-step is on and the code is not typed yet.
  // Same rule as the middleware, so the two never send the browser back and forth.
  const owner = firstRun ? null : await currentOwner();
  const startAt = owner && codePending(owner) ? 'mfa' as const : undefined;
  const notice = firstRun ? REASONS['no-account'] : REASONS[q.exists ? 'exists' : q.reason ?? ''];
  // The key starts the screens fresh when a server action sends the open page here with a new reason.
  return <SignInView key={`${q.reason ?? ''}${q.exists ?? ''}${startAt ?? ''}`} canRegister={firstRun} notice={notice} startAt={startAt} />;
}
