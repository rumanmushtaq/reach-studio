import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { drizzle as drizzlePgliteType } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import { BOOTSTRAP_SQL } from './schema';
import * as schema from './schema';

// Production: Supabase Postgres (SUPABASE_DATABASE_URL, the transaction pooler on port 6543). Local dev and tests:
// PGlite, an embedded Postgres in a folder. Writes that race use conditional UPDATEs, not transactions.

type Db = ReturnType<typeof drizzlePgliteType<typeof schema>>;

let ready: Promise<Db> | null = null;

async function open(): Promise<Db> {
  const url = env.SUPABASE_DATABASE_URL;
  if (url.startsWith('postgres')) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    // The pooler runs in transaction mode, which has no prepared statements. Few connections per function.
    const sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20, ssl: local ? false : 'require' });
    await bootstrap(sql);
    return drizzlePostgres(sql, { schema }) as unknown as Db;
  }
  if (url !== 'memory://') await mkdir(path.dirname(path.resolve(url)), { recursive: true });
  // Loaded only here: PGlite is several MB of WebAssembly that production never needs, and a static
  // import would load it on every cold start.
  const [{ PGlite }, { drizzle: drizzlePglite }] = await Promise.all([import('@electric-sql/pglite'), import('drizzle-orm/pglite')]);
  const client = new PGlite(url === 'memory://' ? undefined : url);
  await client.exec(BOOTSTRAP_SQL);
  return drizzlePglite(client, { schema });
}

const SCHEMA_HASH = createHash('sha256').update(BOOTSTRAP_SQL).digest('hex').slice(0, 16);

/** Creates or updates the tables, but only when BOOTSTRAP_SQL changed since the last run. */
async function bootstrap(sql: postgres.Sql) {
  // ALTER TABLE takes an exclusive lock even when the column already exists. Waiting for it queues every
  // other query on that table behind it, so one stuck reader would hang the whole site. Usually one read.
  const current = await sql.unsafe('SELECT hash FROM schema_version WHERE id = 1')
    .then((rows) => rows[0]?.hash === SCHEMA_HASH, () => false);
  if (current) return;
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL lock_timeout = '5s'"); // give up instead of blocking the site
      await tx.unsafe(`${BOOTSTRAP_SQL}
CREATE TABLE IF NOT EXISTS schema_version (id integer PRIMARY KEY, hash text NOT NULL);
INSERT INTO schema_version (id, hash) VALUES (1, '${SCHEMA_HASH}') ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash;`).simple();
    });
  } catch (e) {
    // Only a busy table is skipped (55P03, lock timeout): the existing tables still work, and the next cold
    // start tries again. Anything else fails the open, so the next call retries it.
    if ((e as { code?: string }).code !== '55P03') throw e;
    console.error('Database setup skipped, a table is busy:', (e as Error).message);
  }
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
