'use server';

import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { newId } from '@/lib/crypto';
import { env } from '@/lib/env';
import {
  changePasswordSchema, fieldErrors, loginSchema, resetSchema, setupSchema,
  type ChangePasswordForm, type FormResult, type LoginForm, type ResetForm, type SetupForm,
} from '@/lib/forms';
import { hashPassword, verifyPassword } from '@/lib/password';
import * as repo from '@/lib/repo';
import { createSession, SESSION_COOKIE, sessionEmail } from '@/lib/session';

// Sign-in with email and password. The first account is made on the sign-in page; in production that
// needs the setup code (the studio's CRON_SECRET), so a stranger cannot claim a fresh studio.
// The same setup code resets a forgotten password.

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

function codeMatches(given: string): boolean {
  const want = Buffer.from(env.CRON_SECRET);
  const got = Buffer.from(given);
  return want.length > 0 && got.length === want.length && timingSafeEqual(got, want);
}

const setupNeedsCode = () => process.env.NODE_ENV === 'production';

async function startSession(email: string, remember: boolean): Promise<void> {
  const { token, maxAge } = await createSession(email);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: env.APP_URL.startsWith('https'), path: '/',
    ...(remember ? { maxAge } : {}), // without "keep me signed in" the cookie ends with the browser
  });
}

export async function signIn(input: LoginForm): Promise<FormResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const { email, password, remember } = parsed.data;
  const user = await repo.getUserByEmail(email);
  const now = Date.now();
  if (user?.lockedUntil && user.lockedUntil > now) {
    return { ok: false, error: `Too many wrong passwords. Try again in ${Math.ceil((user.lockedUntil - now) / 60_000)} minutes, or reset it.` };
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    if (user) {
      const fails = user.failedLogins + 1;
      await repo.updateUser(user.id, { failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? now + LOCK_MS : null });
    }
    return { ok: false, error: 'Wrong email or password.' };
  }
  await repo.updateUser(user.id, { failedLogins: 0, lockedUntil: null });
  await startSession(user.email, remember);
  redirect('/');
}

export async function createOwner(input: SetupForm): Promise<FormResult> {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const { name, email, password, code } = parsed.data;
  if (setupNeedsCode() && !codeMatches(code)) return { ok: false, fields: { code: 'That setup code is wrong. It is the CRON_SECRET you set in Vercel.' } };
  const created = await repo.insertFirstUser({
    id: newId(), name, email, passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, createdAt: Date.now(),
  });
  // An open tab can still show this form after the account was made: send it to sign-in instead.
  if (!created) redirect('/login?exists=1');
  await startSession(email, true);
  redirect('/');
}

export async function resetPassword(input: ResetForm): Promise<FormResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const { email, code, password } = parsed.data;
  const user = await repo.getUserByEmail(email);
  if (!user || !codeMatches(code)) return { ok: false, error: 'The email or the setup code is wrong.' };
  await repo.updateUser(user.id, { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null });
  return { ok: true, message: 'Password changed. Sign in with the new one.' };
}

export async function changePassword(input: ChangePasswordForm): Promise<FormResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
  const email = await sessionEmail((await cookies()).get(SESSION_COOKIE)?.value);
  const user = email ? await repo.getUserByEmail(email) : undefined;
  if (!user) return { ok: false, error: 'Sign in again first.' };
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) return { ok: false, fields: { current: 'That is not your current password' } };
  await repo.updateUser(user.id, { passwordHash: await hashPassword(parsed.data.password), failedLogins: 0, lockedUntil: null });
  return { ok: true, message: 'Password changed' };
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
