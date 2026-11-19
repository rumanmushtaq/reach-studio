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
let pool: postgres.Sql | null = null; // the open Postgres connections, so a stale set can be closed
let bootstrapped = false; // the table check runs once per server, not on every reconnect
let lastUsed = 0;
// Vercel freezes the server between requests. A connection kept across a freeze can come back dead, and a
// query on a dead connection waits forever; so after a quiet spell the studio opens fresh connections.
const STALE_AFTER = 15_000;
const OPEN_LIMIT = 20_000;
// Fluid compute runs several requests in one server, so old connections may still be answering another
// request: they get this long to finish before they are cut.
const RETIRE_AFTER_S = 10;
// A read on a dead connection can wait forever; withDbRetry gives up on it after this long.
const READ_LIMIT = 15_000;

async function open(): Promise<Db> {
  const url = env.SUPABASE_DATABASE_URL;
  if (url.startsWith('postgres')) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    // The pooler runs in transaction mode, which has no prepared statements. Few connections per function.
    const sql = postgres(url, { prepare: false, max: 3, idle_timeout: 10, max_lifetime: 300, connect_timeout: 10, ssl: local ? false : 'require' });
    pool = sql;
    if (!bootstrapped) { await bootstrap(sql); bootstrapped = true; }
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

/** Sends the next query to fresh connections. Queries still running on the old ones may finish first. */
function retire() {
  const g = globalThis as unknown as { __reachDb?: Promise<Db> };
  if (pool) void pool.end({ timeout: RETIRE_AFTER_S }).catch(() => {});
  pool = null;
  g.__reachDb = undefined;
  ready = null;
}

export function db(): Promise<Db> {
  // Keep one handle across Next.js hot reloads in dev. A failed open is not kept, so the next call retries.
  const g = globalThis as unknown as { __reachDb?: Promise<Db> };
  const now = Date.now();
  if (g.__reachDb && pool && lastUsed && now - lastUsed > STALE_AFTER) retire();
  lastUsed = now;
  if (!g.__reachDb) {
    // An open that hangs (no answer from the pooler) fails after OPEN_LIMIT, so the next request retries.
    const opening = Promise.race([
      open(),
      new Promise<never>((_, no) => setTimeout(() => no(new Error('The database did not answer. Try again in a moment.')), OPEN_LIMIT)),
    ]);
    g.__reachDb = ready = opening;
    opening.catch(() => { if (g.__reachDb === opening) { g.__reachDb = undefined; ready = null; } });
  }
  return g.__reachDb;
}

// Errors that mean the connection died, not that the query was wrong (57P01: the server ended the session).
const LOST = new Set(['CONNECTION_DESTROYED', 'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', '57P01', 'READ_TIMEOUT']);

function lostConnection(e: unknown): boolean {
  for (let x = e as { code?: string; cause?: unknown } | undefined; x; x = x.cause as typeof x) {
    if (x.code && LOST.has(x.code)) return true;
  }
  return false;
}

/**
 * Runs a read, and runs it once more on fresh connections when its connection died or it hung for `limit` ms.
 * Only for reads: a write may have gone through before its connection died.
 */
export async function withDbRetry<T>(read: () => Promise<T>, limit = READ_LIMIT): Promise<T> {
  const first = read();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hung = new Promise<never>((_, no) => {
    timer = setTimeout(() => no(Object.assign(new Error('The database did not answer in time.'), { code: 'READ_TIMEOUT' })), limit);
  });
  try {
    return await Promise.race([first, hung]);
  } catch (e) {
    if (!lostConnection(e)) throw e;
    first.catch(() => {}); // a hung read fails later, when its old connections are cut
    retire();
    return read();
  } finally {
    clearTimeout(timer);
  }
}

export { schema };
