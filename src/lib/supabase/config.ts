// Supabase Auth settings, read when the app runs (not baked in at build time), so a value added on
// Vercel works after a plain redeploy. The publishable key is safe to show; it is not a secret.

export type SupabaseConfig = { url: string; key: string };

// Each name is written out in full: the Vercel middleware only gets the variables it names this way.
// NEXT_PUBLIC_ names are also baked in at build time; the bracket form reads them again when the app runs.
function settings(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env['NEXT_PUBLIC_SUPABASE_URL'],
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_DATABASE_URL: process.env.SUPABASE_DATABASE_URL,
  };
}
const read = (name: string) => settings()[name]?.trim() || undefined;

/** The project address: set directly, or worked out from the database pooler user (postgres.<ref>). */
function projectUrl(): string | undefined {
  const url = read('NEXT_PUBLIC_SUPABASE_URL') ?? read('SUPABASE_URL');
  if (url) return url.replace(/\/$/, '');
  const ref = read('SUPABASE_DATABASE_URL')?.match(/\/\/postgres\.([a-z0-9]{20})[:@]/)?.[1];
  return ref ? `https://${ref}.supabase.co` : undefined;
}

export function supabaseConfig(): SupabaseConfig | null {
  const url = projectUrl();
  const key = read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ?? read('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    ?? read('SUPABASE_PUBLISHABLE_KEY') ?? read('SUPABASE_ANON_KEY');
  return url && key ? { url, key } : null;
}

/** Which Supabase settings the running app can see, by name only (never values), to explain a setup problem. */
export function supabaseSettingNames(): { seen: string[]; missing: string[] } {
  const seen = [...new Set([...Object.keys(settings()), ...Object.keys(process.env)])]
    .filter((k) => /SUPABASE/i.test(k) && (read(k) || process.env[k]?.trim())).sort();
  const missing = [
    ...(projectUrl() ? [] : ['NEXT_PUBLIC_SUPABASE_URL']),
    ...(supabaseConfig() || !projectUrl() ? [] : ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']),
  ];
  return { seen, missing };
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
