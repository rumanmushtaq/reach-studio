// Supabase Auth settings. NEXT_PUBLIC_ values are built into the app, so after changing them on Vercel
// you redeploy. The publishable key is safe to show in the browser; it is not a secret.

export type SupabaseConfig = { url: string; key: string };

export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  return url && key ? { url, key } : null;
}

export const MISSING_CONFIG =
  'Sign-in is not set up: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (Supabase → Connect), then redeploy.';

/** Claims of a signed-in user that this app reads. `studio_owner` is set by the studio, never by the user. */
export type OwnerClaims = {
  sub: string; email?: string; aal?: string; amr?: ({ method: string } | string)[];
  app_metadata?: { studio_owner?: boolean; studio_2step?: boolean };
};

export const isOwner = (claims: unknown): claims is OwnerClaims =>
  !!claims && (claims as OwnerClaims).app_metadata?.studio_owner === true;

/** 2-step is on (a flag the studio signs into the token) but this session has not typed the code yet. */
export const codePending = (claims: OwnerClaims) => claims.app_metadata?.studio_2step === true && claims.aal !== 'aal2';

/** The session came from a "reset your password" email link. */
export const fromResetLink = (claims: OwnerClaims) =>
  (claims.amr ?? []).some((a) => (typeof a === 'string' ? a : a.method) === 'recovery');
