import { redirect } from 'next/navigation';
import { NewPasswordView } from '@/components/SignInView';
import { fromResetLink } from '@/lib/supabase/config';
import { currentOwner, supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Opened from the "reset your password" email: the link signed this browser in for it.
export default async function ResetPasswordPage() {
  const owner = await currentOwner();
  if (!owner) redirect('/login?reason=link-expired');
  if (!fromResetLink(owner)) redirect('/settings'); // signed in normally: change the password in Settings
  // Asked from Supabase, not read from the cookie, so the code cannot be skipped.
  const { data, error } = await (await supabaseServer()).auth.mfa.listFactors();
  const needsCode = owner.aal !== 'aal2' && (!!error || !!data?.totp.some((f) => f.status === 'verified'));
  return <NewPasswordView email={owner.email ?? ''} needsCode={needsCode} />;
}
