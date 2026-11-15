import 'server-only';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { env } from '../env';
import { BOOTSTRAP_SQL } from './schema';
import * as schema from './schema';

// Production: Neon over HTTP (DATABASE_URL). Local dev and tests: PGlite, an embedded Postgres in a folder.
// Neon HTTP has no interactive transactions, so writes use conditional UPDATEs instead.

type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

let ready: Promise<Db> | null = null;

async function open(): Promise<Db> {
  const url = env.DATABASE_URL;
  if (url.startsWith('postgres')) {
    const sql = neon(url);
    for (const stmt of BOOTSTRAP_SQL.split(';').map((s) => s.trim()).filter(Boolean)) await sql.query(stmt);
    return drizzleNeon(sql, { schema }) as unknown as Db;
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
