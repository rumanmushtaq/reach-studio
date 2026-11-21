import 'server-only';
import { env } from './env';

/** True when the request carries the studio's CRON_SECRET (Bearer header, or ?key= for simple cron services). */
export function cronAllowed(req: Request): boolean {
  const secret = env.CRON_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? new URL(req.url).searchParams.get('key');
  return !!secret && given === secret;
}
