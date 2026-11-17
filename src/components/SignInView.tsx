'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { createOwner, resendConfirmation, sendResetLink, setNewPassword, signIn, signOut, verifySignInCode } from '@/app/auth-actions';
import {
  forgotSchema, loginSchema, mfaCodeSchema, newPasswordSchema, setupSchema,
  type ForgotForm, type FormResult, type LoginForm, type MfaCodeForm, type NewPasswordForm, type SetupForm,
} from '@/lib/forms';
import { applyResult, Field, FormError, TextInput } from './forms';

// Sign-in screens on Supabase Auth: register → check your inbox, sign in → 2-step code, forgot password →
// check your inbox → new password. Form values live in react-hook-form; useState only picks the screen.

export type Notice = { tone: 'info' | 'good' | 'bad'; text: string };
type Screen = { name: 'signin' } | { name: 'forgot' } | { name: 'mfa' } | { name: 'inbox'; kind: 'confirm' | 'reset'; email: string };

function Brand({ title, sub }: { title?: string; sub: string }) {
  return (
    <div className="auth-head">
      <div className="auth-brand"><span className="logo">R</span><span>Reach Studio</span></div>
      {title && <h1>{title}</h1>}
      <p className="muted">{sub}</p>
    </div>
  );
}

function NoticeBanner({ notice }: { notice?: Notice }) {
  if (!notice) return null;
  return <p className={`banner ${notice.tone === 'good' ? 'ok' : notice.tone}`} role={notice.tone === 'bad' ? 'alert' : 'status'}>{notice.text}</p>;
}

function SubmitButton({ busy, idle, working }: { busy: boolean; idle: string; working: string }) {
  return (
    <button className="btn primary block" disabled={busy} aria-busy={busy}>
      {busy && <span className="spinner" aria-hidden />}{busy ? working : idle}
    </button>
  );
}

function PasswordInput<T extends FieldValues>({ form, name, id, autoComplete, autoFocus }: { form: UseFormReturn<T>; name: Path<T>; id: string; autoComplete: string; autoFocus?: boolean }) {
  const [shown, setShown] = useState(false); // view toggle only; the value lives in react-hook-form
  return (
    <div className="pw">
      <TextInput form={form} name={name} id={id} type={shown ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus} />
      <button type="button" className="link small" onClick={() => setShown((s) => !s)} aria-controls={id} aria-pressed={shown}>{shown ? 'Hide' : 'Show'}</button>
    </div>
  );
}

/** Live checklist for a new password, so the rules are clear before sending. */
function PasswordRules<T extends FieldValues>({ form, name }: { form: UseFormReturn<T>; name: Path<T> }) {
  const value = String(form.watch(name) ?? '');
  const rules = [
    { ok: value.length >= 10, text: '10+ characters' },
    { ok: /[a-zA-Z]/.test(value), text: 'a letter' },
    { ok: /[0-9]/.test(value), text: 'a number' },
  ];
  return (
    <ul className="rules" aria-label="Password rules">
      {rules.map((r) => <li key={r.text} className={r.ok ? 'met' : ''}>{r.ok ? '✓' : '○'} {r.text}</li>)}
    </ul>
  );
}

/** Sends a form to a server action. A crash or lost connection shows on the form instead of doing nothing. */
function useFormAction<T extends FieldValues>(form: UseFormReturn<T>, action: (values: T) => Promise<FormResult>, onOk: (r: FormResult & { ok: true }) => void) {
  const call = useMutation({ mutationFn: action });
  const submit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      const r = await call.mutateAsync(values);
      if (r && applyResult(form, r) && r.ok) onOk(r);
    } catch (e) {
      // A server-action redirect is not an error; anything else is.
      if (e instanceof Error && /NEXT_REDIRECT/.test(e.message)) throw e;
      form.setError('root', { message: navigator.onLine ? 'The studio did not answer. Try again in a moment.' : 'You are offline. Check your internet connection.' });
    }
  });
  return { submit, last: call.data };
}

/** A button with a short wait between presses, for "send the email again". */
function ResendButton({ onSend, label }: { onSend: () => Promise<FormResult>; label: string }) {
  const [wait, setWait] = useState(0);
  const [note, setNote] = useState<Notice>();
  const send = useMutation({ mutationFn: onSend });
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const click = async () => {
    try {
      const r = await send.mutateAsync();
      setNote(r.ok
        ? { tone: 'good', text: 'Sent again. Check your inbox and spam folder.' }
        : { tone: 'bad', text: r.error ?? Object.values(r.fields ?? {})[0] ?? 'Could not send it.' });
      // Supabase allows one email per address a minute; count down so the button is not pressed in vain.
      const wait = r.ok ? 60 : Number(r.code?.match(/^wait-(\d+)$/)?.[1] ?? 0);
      if (wait) setWait(wait);
    } catch {
      setNote({ tone: 'bad', text: 'The studio did not answer. Try again.' });
    }
  };
  return (
    <>
      <NoticeBanner notice={note} />
      <button type="button" className="btn block" onClick={click} disabled={send.isPending || wait > 0}>
        {send.isPending ? 'Sending…' : wait > 0 ? `${label} (${wait}s)` : label}
      </button>
    </>
  );
}

function Inbox({ kind, email, onBack }: { kind: 'confirm' | 'reset'; email: string; onBack: () => void }) {
  const gmail = /@(gmail|googlemail)\.com$/i.test(email);
  return (
    <div className="card auth-card">
      <Brand title="Check your inbox" sub={kind === 'confirm'
        ? 'We sent a link to confirm your email. Open it to finish creating your account.'
        : 'We sent a link to set a new password. Open it on this device, in this browser.'} />
      <p className="inbox-email"><span className="muted small">Sent to</span><strong>{email}</strong></p>
      <ul className="steps small muted">
        <li>The email comes from Supabase and can take a minute.</li>
        <li>Not there? Look in Spam or Promotions.</li>
        <li>The link works once and expires after an hour.</li>
      </ul>
      {gmail && <a className="btn primary block" href="https://mail.google.com/mail/u/0/#search/from%3Asupabase+newer_than%3A1d" target="_blank" rel="noreferrer">Open Gmail</a>}
      <ResendButton label="Send the email again" onSend={() => (kind === 'confirm' ? resendConfirmation({ email }) : sendResetLink({ email }))} />
      <button type="button" className="link small center" onClick={onBack}>{kind === 'confirm' ? 'Use a different email' : 'Back to sign in'}</button>
    </div>
  );
}

function SignInForm({ notice, onForgot, onCode }: { notice?: Notice; onForgot: () => void; onCode: () => void }) {
  const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;
  // On success the server action opens Today; with 2-step on, it asks for the code first.
  const { submit, last } = useFormAction(form, signIn, (r) => { if (r.code === 'mfa') onCode(); });
  const unconfirmed = last && !last.ok && last.code === 'unconfirmed';
  return (
    <form className="card auth-card" onSubmit={submit} noValidate>
      <Brand title="Sign in" sub="Schedule and post your cartoons." />
      <NoticeBanner notice={notice} />
      <FormError message={errors.root?.message} />
      {unconfirmed && <ResendButton label="Send the confirmation email again" onSend={() => resendConfirmation({ email: form.getValues('email') })} />}
      <Field id="email" label="Email" error={errors.email}>
        <TextInput form={form} name="email" id="email" type="email" autoComplete="email" inputMode="email" autoFocus />
      </Field>
      <Field id="password" label="Password" hint={<button type="button" className="link small" onClick={onForgot}>Forgot password?</button>} error={errors.password}>
        <PasswordInput form={form} name="password" id="password" autoComplete="current-password" />
      </Field>
      <SubmitButton busy={isSubmitting} idle="Sign in" working="Signing in…" />
    </form>
  );
}

function CodeForm() {
  const form = useForm<MfaCodeForm>({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: '' } });
  const { errors, isSubmitting } = form.formState;
  const { submit } = useFormAction(form, verifySignInCode, () => undefined);
  return (
    <form className="card auth-card" onSubmit={submit} noValidate>
      <Brand title="Enter your code" sub="2-step sign-in is on. Open your authenticator app and type the 6-digit code for Reach Studio." />
      <FormError message={errors.root?.message} />
      <Field id="code" label="6-digit code" error={errors.code}>
        <TextInput form={form} name="code" id="code" className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus />
      </Field>
      <SubmitButton busy={isSubmitting} idle="Verify and sign in" working="Checking…" />
      <button type="button" className="link small center" onClick={() => signOut()}>Use a different account</button>
    </form>
  );
}

function SetupFormView({ needsCode, onSent }: { needsCode: boolean; onSent: (email: string) => void }) {
  const form = useForm<SetupForm>({ resolver: zodResolver(setupSchema), defaultValues: { name: '', email: '', password: '', confirm: '', code: '' } });
  const { errors, isSubmitting } = form.formState;
  const { submit } = useFormAction(form, createOwner, (r) => { if (r.code === 'check-email') onSent(r.message ?? form.getValues('email')); });
  return (
    <form className="card auth-card" onSubmit={submit} noValidate>
      <Brand title="Create your account" sub="You do this once. After that you sign in with this email and password." />
      <FormError message={errors.root?.message} />
      <Field id="name" label="Your name" error={errors.name}>
        <TextInput form={form} name="name" id="name" autoComplete="name" autoFocus />
      </Field>
      <Field id="email" label="Email" hint="we send a confirmation link here" error={errors.email}>
        <TextInput form={form} name="email" id="email" type="email" autoComplete="email" inputMode="email" />
      </Field>
      <Field id="password" label="Password" error={errors.password}>
        <PasswordInput form={form} name="password" id="password" autoComplete="new-password" />
        <PasswordRules form={form} name="password" />
      </Field>
      <Field id="confirm" label="Type the password again" error={errors.confirm}>
        <PasswordInput form={form} name="confirm" id="confirm" autoComplete="new-password" />
      </Field>
      {needsCode && (
        <Field id="code" label="Setup code" hint="the CRON_SECRET you set in Vercel" error={errors.code}>
          <TextInput form={form} name="code" id="code" autoComplete="off" />
        </Field>
      )}
      <SubmitButton busy={isSubmitting} idle="Create account" working="Creating your account…" />
    </form>
  );
}

function ForgotPasswordForm({ onSent, onBack }: { onSent: (email: string) => void; onBack: () => void }) {
  const form = useForm<ForgotForm>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });
  const { errors, isSubmitting } = form.formState;
  const { submit } = useFormAction(form, sendResetLink, (r) => onSent(r.message ?? form.getValues('email')));
  return (
    <form className="card auth-card" onSubmit={submit} noValidate>
      <Brand title="Forgot your password?" sub="Type your account email. We email you a link to set a new password." />
      <FormError message={errors.root?.message} />
      <Field id="email" label="Email" error={errors.email}>
        <TextInput form={form} name="email" id="email" type="email" autoComplete="email" inputMode="email" autoFocus />
      </Field>
      <SubmitButton busy={isSubmitting} idle="Send reset link" working="Checking your email…" />
      <button type="button" className="link small center" onClick={onBack}>Back to sign in</button>
    </form>
  );
}

export function SignInView({ firstRun, needsCode, notice, startAt }: { firstRun: boolean; needsCode: boolean; notice?: Notice; startAt?: 'mfa' }) {
  const [screen, setScreen] = useState<Screen>(startAt === 'mfa' ? { name: 'mfa' } : { name: 'signin' }); // which screen, not form data
  const [hashNotice, setHashNotice] = useState<Notice>();
  useEffect(() => {
    // Old-style Supabase links report errors after #, which the server never sees.
    const p = new URLSearchParams(window.location.hash.slice(1));
    const code = p.get('error_code');
    if (code) setHashNotice({ tone: 'bad', text: code === 'otp_expired' ? 'That email link has expired or was already used. Ask for a new one.' : (p.get('error_description') ?? 'That email link did not work.') });
  }, []);
  const toSignIn = () => setScreen({ name: 'signin' });
  return (
    <main className="login">
      {screen.name === 'inbox' ? <Inbox kind={screen.kind} email={screen.email} onBack={firstRun && screen.kind === 'confirm' ? () => location.reload() : toSignIn} />
        : firstRun ? <SetupFormView needsCode={needsCode} onSent={(email) => setScreen({ name: 'inbox', kind: 'confirm', email })} />
        : screen.name === 'mfa' ? <CodeForm />
        : screen.name === 'forgot' ? <ForgotPasswordForm onBack={toSignIn} onSent={(email) => setScreen({ name: 'inbox', kind: 'reset', email })} />
        : <SignInForm notice={hashNotice ?? notice} onForgot={() => setScreen({ name: 'forgot' })} onCode={() => setScreen({ name: 'mfa' })} />}
    </main>
  );
}

/** Last step of "forgot password", opened from the email link. */
export function NewPasswordView({ email, needsCode }: { email: string; needsCode: boolean }) {
  const form = useForm<NewPasswordForm & { code: string }>({
    resolver: zodResolver(needsCode ? newPasswordSchema.and(mfaCodeSchema) : newPasswordSchema) as never,
    defaultValues: { password: '', confirm: '', code: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const { submit } = useFormAction(form, setNewPassword, () => undefined); // success signs out and opens sign-in
  return (
    <main className="login">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <Brand title="Set a new password" sub={`For ${email}. After this you sign in with the new password, and other devices are signed out.`} />
        <FormError message={errors.root?.message} />
        <Field id="password" label="New password" error={errors.password}>
          <PasswordInput form={form} name="password" id="password" autoComplete="new-password" autoFocus />
          <PasswordRules form={form} name="password" />
        </Field>
        <Field id="confirm" label="Type it again" error={errors.confirm}>
          <PasswordInput form={form} name="confirm" id="confirm" autoComplete="new-password" />
        </Field>
        {needsCode && (
          <Field id="code" label="6-digit code from your authenticator app" error={errors.code}>
            <TextInput form={form} name="code" id="code" className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          </Field>
        )}
        <SubmitButton busy={isSubmitting} idle="Save new password" working="Saving…" />
      </form>
    </main>
  );
}
