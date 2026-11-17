import { SignInView } from '@/components/SignInView';
import { countUsers } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ exists?: string }> }) {
  // A fresh studio has no account yet: the page shows "Create your account" instead of sign-in.
  const firstRun = (await countUsers()) === 0;
  const notice = !firstRun && (await searchParams).exists ? 'Your account already exists. Sign in with it.' : undefined;
  // The key remounts the view when the action sends the open form here, so the notice shows.
  return <SignInView key={notice ? 'exists' : 'plain'} firstRun={firstRun} needsCode={process.env.NODE_ENV === 'production'} notice={notice} />;
}
