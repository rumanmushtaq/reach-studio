import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Needs a real Postgres server, because the bug lives in how connections are opened and closed. Run with
// TEST_POSTGRES_URL=postgres://postgres:test@127.0.0.1:55439/postgres npx vitest run src/lib/db
const URL = process.env.TEST_POSTGRES_URL;

describe.skipIf(!URL)('database connections', () => {
  let mod: typeof import('./index');
  let admin: postgres.Sql;

  beforeAll(async () => {
    process.env.SUPABASE_DATABASE_URL = URL;
    mod = await import('./index');
    admin = postgres(URL!, { max: 1 });
  });
  afterAll(async () => { await admin.end(); });

  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('lets a query that is running finish when another request opens fresh connections', async () => {
    const d = await mod.db();
    const slow = Promise.resolve(d.execute(sql`select pg_sleep(1.5) as slept`));
    await pause(300);
    // A second request arrives after a quiet spell and opens fresh connections.
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 16_000);
    await mod.db();
    clock.mockRestore();
    await expect(slow).resolves.toBeDefined();
  });

  it('runs a read again on fresh connections when its connection is cut', async () => {
    let calls = 0;
    const rows = await mod.withDbRetry(async () => {
      calls++;
      const d = await mod.db();
      if (calls === 1) {
        setTimeout(() => void admin`select pg_terminate_backend(pid) from pg_stat_activity where query like '%pg_sleep(4)%' and pid <> pg_backend_pid()`.then(), 300);
        return d.execute(sql`select pg_sleep(4)`);
      }
      return d.execute(sql`select 1 as ok`);
    });
    expect(calls).toBe(2);
    expect(rows).toMatchObject([{ ok: 1 }]); // postgres-js returns the rows as an array
  });

  it('gives up on a read that hangs and runs it again on fresh connections', async () => {
    let calls = 0;
    const started = Date.now();
    const rows = await mod.withDbRetry(async () => {
      calls++;
      const d = await mod.db();
      return d.execute(calls === 1 ? sql`select pg_sleep(5) as ok` : sql`select 1 as ok`);
    }, 800);
    expect(calls).toBe(2);
    expect(rows).toMatchObject([{ ok: 1 }]); // postgres-js returns the rows as an array
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
