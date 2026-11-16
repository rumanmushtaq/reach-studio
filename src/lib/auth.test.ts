import { describe, expect, it } from 'vitest';
import { changePasswordSchema, channelSchema, loginSchema, setupSchema } from './forms';
import { hashPassword, verifyPassword } from './password';

describe('passwords', () => {
  it('hashes with a fresh salt and checks only the right password', async () => {
    const a = await hashPassword('cartoon-time-42');
    const b = await hashPassword('cartoon-time-42');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('cartoon-time-42', a)).toBe(true);
    expect(await verifyPassword('cartoon-time-43', a)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });
});

describe('form rules', () => {
  const errors = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
    Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]));

  it('cleans the email and needs a password to sign in', () => {
    expect(loginSchema.parse({ email: '  Me@Gmail.com ', password: 'x', remember: true }).email).toBe('me@gmail.com');
    expect(errors(loginSchema.safeParse({ email: 'nope', password: '', remember: false }))).toEqual({
      email: 'Enter a valid email, like you@gmail.com', password: 'Enter your password',
    });
  });

  it('asks for a strong password typed twice when creating the account', () => {
    const base = { name: 'Ruman', email: 'me@gmail.com', code: '' };
    expect(setupSchema.safeParse({ ...base, password: 'cartoon-time-42', confirm: 'cartoon-time-42' }).success).toBe(true);
    expect(errors(setupSchema.safeParse({ ...base, password: 'short1', confirm: 'short1' })).password).toBe('Use at least 10 characters');
    expect(errors(setupSchema.safeParse({ ...base, password: 'onlyletterslong', confirm: 'onlyletterslong' })).password).toBe('Add at least one number');
    expect(errors(setupSchema.safeParse({ ...base, password: 'cartoon-time-42', confirm: 'cartoon-time-24' })).confirm).toBe('The passwords do not match');
  });

  it('refuses the same password when changing it', () => {
    expect(errors(changePasswordSchema.safeParse({ current: 'cartoon-time-42', password: 'cartoon-time-42', confirm: 'cartoon-time-42' })).password)
      .toBe('Choose a password you have not used here');
  });

  it('accepts empty links but not half links', () => {
    const links = { youtube: '', facebook: 'https://facebook.com/leo', instagram: '', tiktok: '' };
    expect(channelSchema.safeParse({ channel: 'Leo', niche: '', links }).success).toBe(true);
    expect(errors(channelSchema.safeParse({ channel: 'Leo', niche: '', links: { ...links, youtube: 'youtube' } }))['links.youtube'])
      .toBe('Paste the full link, starting with https://');
  });
});
