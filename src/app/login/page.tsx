import { SignInView } from '@/components/SignInView';
import { countUsers } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // A fresh studio has no account yet: the page shows "Create your account" instead of sign-in.
  const firstRun = (await countUsers()) === 0;
  return <SignInView firstRun={firstRun} needsCode={process.env.NODE_ENV === 'production'} />;
}
