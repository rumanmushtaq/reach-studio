import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { MISSING_CONFIG, supabaseConfig, isOwner, type OwnerClaims } from './config';

/** Supabase client for server components, server actions and route handlers. It keeps the session in cookies. */
export async function supabaseServer() {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error(MISSING_CONFIG);
  const jar = await cookies();
  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        // Server components cannot set cookies; the middleware refreshes the session for them.
        try { for (const { name, value, options } of list) jar.set(name, value, options); } catch { /* read-only here */ }
      },
    },
  });
}

/** The signed-in studio owner, or null. */
export async function currentOwner(): Promise<OwnerClaims | null> {
  if (!supabaseConfig()) return null;
  const { data } = await (await supabaseServer()).auth.getClaims();
  return isOwner(data?.claims) ? data.claims : null;
}

/** This site's address as the browser sees it, for links in emails. Works on Vercel and on localhost. */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3100';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
