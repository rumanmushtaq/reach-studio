import { redirect } from 'next/navigation';
import { AuthProblem, missingConfigProblem } from '@/components/AuthProblem';
import { RegisterView } from '@/components/SignInView';
import { MISSING_CONFIG, supabaseConfig, supabaseSettingNames } from '@/lib/supabase/config';
import { ownerExists } from '@/lib/supabase/owner';

export const dynamic = 'force-dynamic';

// Creates the one studio account. Once it exists, this page sends you to sign in.
export default async function RegisterPage() {
  if (!supabaseConfig()) {
    const { seen, missing } = supabaseSettingNames();
    return <AuthProblem text={MISSING_CONFIG} detail={missingConfigProblem(seen, missing)} />;
  }
  let exists: boolean;
  try {
    exists = await ownerExists();
  } catch (e) {
    return <AuthProblem text={`The studio cannot read Supabase Auth through SUPABASE_DATABASE_URL: ${e instanceof Error ? e.message : String(e)}`} />;
  }
  if (exists) redirect('/login?exists=1');
  return <RegisterView needsCode={process.env.NODE_ENV === 'production'} />;
}
