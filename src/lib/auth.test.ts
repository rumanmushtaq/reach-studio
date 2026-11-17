import { describe, expect, it } from 'vitest';
import { changePasswordSchema, channelSchema, forgotSchema, loginSchema, mfaCodeSchema, newPasswordSchema, setupSchema } from './forms';
import { isOwner } from './supabase/config';

describe('form rules', () => {
  const errors = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
    Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]));

  it('cleans the email and needs a password to sign in', () => {
    expect(loginSchema.parse({ email: '  Me@Gmail.com ', password: 'x' }).email).toBe('me@gmail.com');
    expect(errors(loginSchema.safeParse({ email: 'nope', password: '' }))).toEqual({
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

  it('asks only for an email to reset the password, then a new password typed twice', () => {
    expect(forgotSchema.parse({ email: ' Me@Gmail.com' })).toEqual({ email: 'me@gmail.com' });
    expect(forgotSchema.safeParse({ email: '' }).error?.issues[0].message).toBe('Enter your email');
    expect(errors(newPasswordSchema.safeParse({ password: 'cartoon-time-42', confirm: 'cartoon-time-4' })).confirm).toBe('The passwords do not match');
  });

  it('takes a 6-digit 2-step code', () => {
    expect(mfaCodeSchema.parse({ code: ' 123456 ' }).code).toBe('123456');
    expect(errors(mfaCodeSchema.safeParse({ code: '12345' })).code).toBe('Type the 6-digit code from your authenticator app');
  });

  it('accepts empty links but not half links', () => {
    const links = { youtube: '', facebook: 'https://facebook.com/leo', instagram: '', tiktok: '' };
    expect(channelSchema.safeParse({ channel: 'Leo', niche: '', links }).success).toBe(true);
    expect(errors(channelSchema.safeParse({ channel: 'Leo', niche: '', links: { ...links, youtube: 'youtube' } }))['links.youtube'])
      .toBe('Paste the full link, starting with https://');
  });
});

describe('studio owner', () => {
  it('trusts only the owner flag the studio sets in app_metadata', () => {
    expect(isOwner({ sub: 'u1', app_metadata: { studio_owner: true } })).toBe(true);
    expect(isOwner({ sub: 'u1', app_metadata: {}, user_metadata: { studio_owner: true } })).toBe(false);
    expect(isOwner(null)).toBe(false);
  });
});
