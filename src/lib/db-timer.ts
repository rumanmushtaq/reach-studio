import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { env } from './env';

// The job runner needs a reliable alarm clock: GitHub's schedule runs hours late, and the studio only
// wakes when someone opens it. Supabase Postgres has one built in (pg_cron, with pg_net for web calls),
// so the database itself calls the job runner every 5 minutes. Nothing to sign up for.
const JOB = 'reach-studio-tick';
const EVERY = '*/5 * * * *';

export type TimerStatus = {
  active: boolean;
  schedule: string | null;
  lastRuns: { at: string; status: string; message: string | null }[];
  lastAnswers: { at: string; status: number | null; error: string | null }[];
};

/** Starts the timer, or updates it when the address or secret changed. Safe to run again. */
export async function startDbTimer(origin: string): Promise<void> {
  if (!env.SUPABASE_DATABASE_URL.startsWith('postgres')) throw new Error('The timer needs Supabase Postgres; local PGlite has no pg_cron.');
  const d = await db();
  await d.execute(sql`create extension if not exists pg_cron`);
  await d.execute(sql`create extension if not exists pg_net with schema extensions`);
  // format() quotes the address and secret, so neither can break out of the command.
  await d.execute(sql`select cron.schedule(${JOB}, ${EVERY}, format(
    'select net.http_get(url := %L, headers := jsonb_build_object(''Authorization'', %L), timeout_milliseconds := 300000)',
    ${`${origin.replace(/\/$/, '')}/api/cron/tick`}, ${`Bearer ${env.CRON_SECRET}`}))`);
}

/** Whether the timer is on, and how its last runs and the studio's answers went. */
export async function dbTimerStatus(): Promise<TimerStatus> {
  const d = await db();
  const rows = <T>(r: unknown) => (Array.isArray(r) ? r : (r as { rows: T[] }).rows) as T[];
  const [job] = rows<{ jobid: number; schedule: string; active: boolean }>(await d.execute(sql`select jobid, schedule, active from cron.job where jobname = ${JOB}`));
  if (!job) return { active: false, schedule: null, lastRuns: [], lastAnswers: [] };
  const runs = rows<{ start_time: string; status: string; return_message: string | null }>(await d.execute(
    sql`select start_time::text, status, return_message from cron.job_run_details where jobid = ${job.jobid} order by start_time desc limit 3`));
  const answers = rows<{ created: string; status_code: number | null; error_msg: string | null }>(await d.execute(
    sql`select created::text, status_code, error_msg from net._http_response order by created desc limit 3`).catch(() => []));
  return {
    active: job.active,
    schedule: job.schedule,
    lastRuns: runs.map((r) => ({ at: r.start_time, status: r.status, message: r.return_message })),
    lastAnswers: answers.map((a) => ({ at: a.created, status: a.status_code, error: a.error_msg })),
  };
}
