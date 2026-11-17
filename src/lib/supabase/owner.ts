import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '../db';

// The studio has one owner: the Supabase Auth user whose app_metadata has studio_owner = true.
// Only the studio sets that flag (users cannot change their own app_metadata), so a stranger who
// signs up with the public key directly still cannot open the studio. These read Supabase's
// auth.users table through the studio's own database connection.

type Row = Record<string, unknown>;

async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  const result = (await (await db()).execute(query)) as unknown;
  return Array.isArray(result) ? (result as Row[]) : ((result as { rows: Row[] }).rows ?? []);
}

export async function ownerExists(): Promise<boolean> {
  const r = await rows(sql`select 1 from auth.users where raw_app_meta_data->>'studio_owner' = 'true' limit 1`);
  return r.length > 0;
}

export type AuthUser = { id: string; confirmed: boolean; owner: boolean };

export async function authUserByEmail(email: string): Promise<AuthUser | null> {
  const r = await rows(sql`
    select id::text as id, email_confirmed_at is not null as confirmed,
           coalesce(raw_app_meta_data->>'studio_owner', '') = 'true' as owner
    from auth.users where lower(email) = lower(${email}) and deleted_at is null limit 1`);
  return r[0] ? { id: String(r[0].id), confirmed: r[0].confirmed === true, owner: r[0].owner === true } : null;
}

/** Makes this user the owner, only if nobody else is. Returns false when another account already owns the studio. */
export async function markOwner(id: string): Promise<boolean> {
  await (await db()).execute(sql`
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"studio_owner": true}'::jsonb
    where id = ${id}::uuid
      and not exists (select 1 from auth.users o where o.raw_app_meta_data->>'studio_owner' = 'true' and o.id <> ${id}::uuid)`);
  const r = await rows(sql`select 1 from auth.users where id = ${id}::uuid and raw_app_meta_data->>'studio_owner' = 'true'`);
  return r.length > 0;
}

/** Records in the signed token whether 2-step sign-in is on, so the middleware can ask for the code
 *  without calling Supabase on every page. Sessions pick it up when they refresh. */
export async function setTwoStepFlag(id: string, on: boolean): Promise<void> {
  await (await db()).execute(sql`
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('studio_2step', ${on}::boolean)
    where id = ${id}::uuid`);
}
