import { afterEach, describe, expect, it } from 'vitest';
import { cronAllowed } from './cron-auth';

describe('job runner secret', () => {
  afterEach(() => { delete process.env.CRON_SECRET; });
  const req = (headers: Record<string, string> = {}, query = '') => new Request(`https://studio.test/api/cron/tick${query}`, { headers });

  it('lets in the right secret, as a Bearer header or ?key=', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(cronAllowed(req({ authorization: 'Bearer s3cret' }))).toBe(true);
    expect(cronAllowed(req({}, '?key=s3cret'))).toBe(true);
  });

  it('refuses a wrong or missing secret, and everyone when the studio has none', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(cronAllowed(req({ authorization: 'Bearer nope' }))).toBe(false);
    expect(cronAllowed(req())).toBe(false);
    delete process.env.CRON_SECRET;
    expect(cronAllowed(req({ authorization: 'Bearer ' }))).toBe(false);
  });
});
