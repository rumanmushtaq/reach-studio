import 'server-only';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import { BOOTSTRAP_SQL } from './schema';
import * as schema from './schema';

// Production: Supabase Postgres (SUPABASE_DATABASE_URL, the transaction pooler on port 6543). Local dev and tests:
// PGlite, an embedded Postgres in a folder. Writes that race use conditional UPDATEs, not transactions.

type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

let ready: Promise<Db> | null = null;

async function open(): Promise<Db> {
  const url = env.SUPABASE_DATABASE_URL;
  if (url.startsWith('postgres')) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    // The pooler runs in transaction mode, which has no prepared statements. Few connections per function.
    const sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20, ssl: local ? false : 'require' });
    for (const stmt of BOOTSTRAP_SQL.split(';').map((s) => s.trim()).filter(Boolean)) await sql.unsafe(stmt);
    return drizzlePostgres(sql, { schema }) as unknown as Db;
  }
  if (url !== 'memory://') await mkdir(path.dirname(path.resolve(url)), { recursive: true });
  const client = new PGlite(url === 'memory://' ? undefined : url);
  await client.exec(BOOTSTRAP_SQL);
  return drizzlePglite(client, { schema });
}

export function db(): Promise<Db> {
  // Keep one handle across Next.js hot reloads in dev. A failed open is not kept, so the next call retries.
  const g = globalThis as unknown as { __reachDb?: Promise<Db> };
  if (!g.__reachDb) {
    g.__reachDb = ready ??= open();
    g.__reachDb.catch(() => { g.__reachDb = undefined; ready = null; });
  }
  return g.__reachDb;
}

export { schema };
