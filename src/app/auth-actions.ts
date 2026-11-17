'use server';

import { timingSafeEqual } from 'node:crypto';
import { createClient, type AuthError, type SupabaseClient, type User } from '@supabase/supabase-js';
import { redirect, unstable_rethrow } from 'next/navigation';
import { env } from '@/lib/env';
import {
  changePasswordSchema, fieldErrors, forgotSchema, loginSchema, mfaCodeSchema, newPasswordSchema, setupSchema,
  type ChangePasswordForm, type ForgotForm, type FormResult, type LoginForm, type MfaCodeForm, type NewPasswordForm, type SetupForm,
} from '@/lib/forms';
import * as repo from '@/lib/repo';
import { fromResetLink, isOwner, MISSING_CONFIG, supabaseConfig, type OwnerClaims } from '@/lib/supabase/config';
import { authUserByEmail, markOwner, ownerExists, setTwoStepFlag } from '@/lib/supabase/owner';
import { siteOrigin, supabaseServer } from '@/lib/supabase/server';

// Sign-in runs on Supabase Auth: register (with email confirmation), sign in, 2-step codes, forgot password
// (Supabase emails a reset link) and sign out. The studio has one owner; the first account is made on the
// sign-in page and, in production, needs the setup code (the studio's CRON_SECRET) so a stranger cannot claim it.

const setupNeedsCode = () => process.env.NODE_ENV === 'production';

function codeMatches(given: string): boolean {
  const want = Buffer.from(env.CRON_SECRET);
  const got = Buffer.from(given);
  return want.length > 0 && got.length === want.length && timingSafeEqual(got, want);
}

type Failure = Extract<FormResult, { ok: false }>;

/** Plain words for Supabase Auth errors, with a code the page can act on. */
function failure(error: AuthError | Error): Failure {
  const code = 'code' in error ? (error.code as string | undefined) : undefined;
  const status = 'status' in error ? (error.status as number | undefined) : undefined;
  const say = (message: string, next?: string): Failure => ({ ok: false, error: message, code: next ?? code });
  switch (code) {
    case 'invalid_credentials': return say('Wrong email or password.');
    case 'email_not_confirmed': return say('Confirm your email first: open the link we sent you. No email? Send it again below.', 'unconfirmed');
    case 'user_banned': return say('This account is blocked in Supabase (Authentication → Users).');
    case 'over_email_send_rate_limit': {
      // Per address: "you can only request this after 55 seconds". Per project: the hourly email limit.
      const seconds = Number(error.message.match(/after (\d+) second/)?.[1]);
      return seconds
        ? say(`We just sent an email. Wait ${seconds} seconds before asking for another one.`, `wait-${seconds}`)
        : say('Supabase has sent its email limit for now. Wait a while, then try again. Custom SMTP in Supabase raises the limit.');
    }
    case 'over_request_rate_limit': return say('Too many tries. Wait a minute, then try again.');
    case 'same_password': return say('Choose a password different from your old one.');
    case 'weak_password': return say(`Supabase wants a stronger password: ${error.message}`);
    case 'user_already_exists':
    case 'email_exists': return say('This email already has an account. Sign in instead.');
    case 'signup_disabled': return say('New sign-ups are off in Supabase. Turn on Authentication → Sign In / Providers → "Allow new users to sign up", create your account, then turn it off again.');
    case 'email_address_not_authorized': return say("Supabase's built-in email only sends to members of your Supabase team. Use that email, or add your own SMTP in Supabase → Authentication → Emails.");
    case 'email_address_invalid': return say('Supabase does not accept this email address. Use another one.');
    case 'otp_expired': return say('This link has expired. Ask for a new one.');
    case 'mfa_verification_failed':
    case 'mfa_challenge_expired': return { ok: false, fields: { code: 'That code is wrong or too old. Type the newest code from your app.' } };
    case 'insufficient_aal': return say('Type the 6-digit code from your authenticator app first.', 'mfa');
    case 'session_not_found':
    case 'refresh_token_not_found': return say('You were signed out. Sign in again.', 'signed-out');
  }
  if (status === 0 || /fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(error.message)) {
    return say('Cannot reach Supabase. Check your internet connection and NEXT_PUBLIC_SUPABASE_URL.', 'offline');
  }
  return say(error.message || 'Something went wrong. Try again.');
}

/** Runs an action and turns any crash into a message for the page; redirects pass through. */
async function guard<T>(fn: () => Promise<T | Failure>): Promise<T | Failure> {
  if (!supabaseConfig()) return { ok: false, error: MISSING_CONFIG };
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    console.error('auth action failed', e);
    return failure(e instanceof Error ? e : new Error(String(e)));
  }
}

const nameOf = (user: User, fallback?: string) =>
  (typeof user.user_metadata?.name === 'string' && user.user_metadata.name) || fallback || user.email || 'Owner';

async function rememberProfile(user: User, signedIn: boolean): Promise<void> {
  const existing = await repo.getProfile(user.id);
  await repo.saveProfile({ id: user.id, name: nameOf(user, existing?.name), email: user.email ?? existing?.email ?? '' }, Date.now(), signedIn);
}

/** The verified 2-step factor, asked from Supabase (not read from the cookie). An error stops the action. */
async function verifiedFactorId(supabase: SupabaseClient): Promise<string | undefined> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.find((f) => f.status === 'verified')?.id;
}

/** Keeps the token's 2-step flag in step with Supabase, refreshing the session when it changes. */
async function syncTwoStepFlag(supabase: SupabaseClient, userId: string, flag: boolean | undefined, on: boolean): Promise<void> {
  if ((flag === true) === on) return;
  await setTwoStepFlag(userId, on);
  const { error } = await supabase.auth.refreshSession();
  if (error) throw error;
}

/** The signed-in owner, with the 2-step code typed when 2-step is on; otherwise a failure to show. */
async function fullySignedIn(supabase: SupabaseClient): Promise<{ claims: OwnerClaims } | Failure> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data || !isOwner(data.claims)) return { ok: false, error: 'You are signed out. Sign in again.', code: 'signed-out' };
  if (data.claims.aal !== 'aal2' && (await verifiedFactorId(supabase))) {
    return { ok: false, error: 'Type your 6-digit code first: sign out, then sign in again.', code: 'mfa' };
  }
  return { claims: data.claims };
}

// ---------- Login ----------

export async function signIn(input: LoginForm): Promise<FormResult> {
  return guard(async () => {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return failure(error);
    // Credentials are right: now the account status, then 2-step.
    if (!isOwner({ app_metadata: data.user.app_metadata })) {
      await supabase.auth.signOut({ scope: 'local' });
      return { ok: false, error: 'This account does not own this studio. Sign in with the owner email.' };
    }
    await rememberProfile(data.user, true);
    const factorId = await verifiedFactorId(supabase);
    await syncTwoStepFlag(supabase, data.user.id, data.user.app_metadata.studio_2step, !!factorId);
    if (factorId) return { ok: true, code: 'mfa' };
    redirect('/');
  });
}

/** Second step of sign-in: the 6-digit code from the authenticator app. */
export async function verifySignInCode(input: MfaCodeForm): Promise<FormResult> {
  return guard(async () => {
    const parsed = mfaCodeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
    const supabase = await supabaseServer();
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims || !isOwner(claims.claims)) return { ok: false, error: 'You are signed out. Sign in again.', code: 'signed-out' };
    const factorId = await verifiedFactorId(supabase);
    if (!factorId) {
      // 2-step was turned off elsewhere (e.g. in the Supabase dashboard): clear the flag and go on.
      await syncTwoStepFlag(supabase, claims.claims.sub, claims.claims.app_metadata?.studio_2step, false);
      redirect('/');
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data.code });
    if (error) return failure(error);
    redirect('/');
  });
}

// ---------- Register ----------

export async function createOwner(input: SetupForm): Promise<FormResult> {
  return guard(async () => {
    const parsed = setupSchema.safeParse(input);
    if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
    const { name, email, password, code } = parsed.data;
    if (setupNeedsCode() && !codeMatches(code)) return { ok: false, fields: { code: 'That setup code is wrong. It is the CRON_SECRET you set in Vercel.' } };
    if (await ownerExists()) redirect('/login?exists=1');

    const supabase = await supabaseServer();
    const emailRedirectTo = `${await siteOrigin()}/auth/callback?next=/&kind=signup`;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo } });
    if (error) return failure(error);
    let user = data.user;
    let session = data.session;

    // Supabase hides whether a confirmed account already uses this email (it returns no identities).
    // If the password is right, that account becomes the owner.
    if (user && user.identities?.length === 0) {
      const signedIn = await supabase.auth.signInWithPassword({ email, password });
      if (signedIn.error) return { ok: false, error: 'This email already has a Supabase account with another password. Use "Forgot password?" on the sign-in page.' };
      user = signedIn.data.user;
      session = signedIn.data.session;
    }
    if (!user) return { ok: false, error: 'Supabase did not create the account. Try again.' };
    if (!(await markOwner(user.id))) {
      if (session) await supabase.auth.signOut({ scope: 'local' });
      redirect('/login?exists=1');
    }

    if (!session) return { ok: true, code: 'check-email', message: email }; // Supabase asks to confirm the email
    await supabase.auth.refreshSession(); // the new token carries the owner flag
    await repo.saveProfile({ id: user.id, name, email }, Date.now(), true);
    redirect('/');
  });
}

export async function resendConfirmation(input: ForgotForm): Promise<FormResult> {
  return guard(async () => {
    const parsed = forgotSchema.safeParse(input);
    if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.resend({
      type: 'signup', email: parsed.data.email, options: { emailRedirectTo: `${await siteOrigin()}/auth/callback?next=/&kind=signup` },
    });
    return error ? failure(error) : { ok: true, message: `We sent a new confirmation link to ${parsed.data.email}.` };
  });
}

// ---------- Forgot password ----------

export async function sendResetLink(input: ForgotForm): Promise<FormResult> {
  return guard(async () => {
    const parsed = forgotSchema.safeParse(input);
    if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
    const { email } = parsed.data;
    const user = await authUserByEmail(email);
    if (!user?.owner) return { ok: false, fields: { email: 'No studio account uses this email. Check it for typos.' } };
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password` });
    return error ? failure(error) : { ok: true, code: 'reset-sent', message: email };
  });
}

/** Last step of "forgot password": the reset link signed this browser in for it. Then every device signs out. */
export async function setNewPassword(input: NewPasswordForm & { code?: string }): Promise<FormResult> {
  return guard(async () => {
    const parsed = newPasswordSchema.safeParse(input);
    if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
    const supabase = await supabaseServer();
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims || !isOwner(claims.claims) || !fromResetLink(claims.claims)) {
      return { ok: false, error: 'This reset link has expired. Ask for a new one on the sign-in page.', code: 'expired' };
    }
    const factorId = claims.claims.aal === 'aal2' ? undefined : await verifiedFactorId(supabase);
    if (factorId) {
      const code = mfaCodeSchema.safeParse({ code: input.code ?? '' });
      if (!code.success) return { ok: false, error: 'Type the 6-digit code from your authenticator app.', fields: fieldErrors(code.error) };
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.data.code });
      if (error) return failure(error);
    }
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return failure(error);
    await supabase.auth.signOut({ scope: 'global' }); // other devices lose their session when their token next refreshes
    redirect('/login?reason=password-changed');
  });
}

// ---------- Signed in: Settings ----------

/** Checks a password without touching this browser's session. */
async function passwordIsRight(email: string, password: string): Promise<boolean> {
  const cfg = supabaseConfig()!;
  const check = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await check.auth.signInWithPassword({ email, password });
  if (error) return false;
  await check.auth.signOut({ scope: 'local' });
  return true;
}

export async function changePassword(input: ChangePasswordForm): Promise<FormResult> {
  return guard(async () => {
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
    const supabase = await supabaseServer();
    const me = await fullySignedIn(supabase);
    if (!('claims' in me)) return me;
    const email = me.claims.email ?? '';
    if (!(await passwordIsRight(email, parsed.data.current))) return { ok: false, fields: { current: 'That is not your current password' } };
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return failure(error);
    await supabase.auth.signOut({ scope: 'others' }); // other devices sign in again
    return { ok: true, message: 'Password changed. Other devices were signed out.' };
  });
}

export type TwoStepSetup = { ok: true; factorId: string; qr: string; secret: string } | Failure;

/** Starts 2-step sign-in: returns the QR code to scan with an authenticator app. */
export async function startTwoStep(): Promise<TwoStepSetup> {
  return guard(async () => {
    const supabase = await supabaseServer();
    const me = await fullySignedIn(supabase);
    if (!('claims' in me)) return me;
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) return failure(listError);
    if (factors.totp.some((f) => f.status === 'verified')) return { ok: false, error: '2-step sign-in is already on. Reload the page.' };
    for (const f of factors.all) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${Date.now()}` });
    if (error) return failure(error);
    return { ok: true as const, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  });
}

export async function confirmTwoStep(input: MfaCodeForm & { factorId: string }): Promise<FormResult> {
  return guard(async () => {
    const parsed = mfaCodeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };
    const supabase = await supabaseServer();
    const me = await fullySignedIn(supabase);
    if (!('claims' in me)) return me;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: input.factorId, code: parsed.data.code });
    if (error) return failure(error);
    await syncTwoStepFlag(supabase, me.claims.sub, me.claims.app_metadata?.studio_2step, true);
    await supabase.auth.signOut({ scope: 'others' }); // other devices sign in again, now with the code
    return { ok: true, message: '2-step sign-in is on. Next time you sign in, type the code from your app.' };
  });
}

export async function turnOffTwoStep(): Promise<FormResult> {
  return guard(async () => {
    const supabase = await supabaseServer();
    const me = await fullySignedIn(supabase);
    if (!('claims' in me)) return me;
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) return failure(listError);
    for (const f of factors.all) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) return failure(error);
    }
    await syncTwoStepFlag(supabase, me.claims.sub, true, false);
    return { ok: true, message: '2-step sign-in is off.' };
  });
}

export async function signOut(): Promise<void> {
  if (supabaseConfig()) await (await supabaseServer()).auth.signOut({ scope: 'local' }).catch(() => undefined);
  redirect('/login?reason=signed-out');
}
