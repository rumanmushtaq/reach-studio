'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { createOwner, resetPassword, signIn } from '@/app/auth-actions';
import { loginSchema, resetSchema, setupSchema, type LoginForm, type ResetForm, type SetupForm } from '@/lib/forms';
import { applyResult, Field, FormError, TextInput } from './forms';

type Screen = 'signin' | 'reset';

function Brand({ sub }: { sub: string }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="logo">R</span><h1 style={{ fontSize: 24, fontWeight: 800 }}>Reach Studio</h1></div>
      <p className="small muted">{sub}</p>
    </>
  );
}

function PasswordInput<T extends FieldValues>({ form, name, id, autoComplete }: { form: UseFormReturn<T>; name: Path<T>; id: string; autoComplete: string }) {
  const [shown, setShown] = useState(false); // view toggle only; the value lives in react-hook-form
  return (
    <div className="pw">
      <TextInput form={form} name={name} id={id} type={shown ? 'text' : 'password'} autoComplete={autoComplete} />
      <button type="button" className="link small" onClick={() => setShown((s) => !s)} aria-controls={id} aria-pressed={shown}>{shown ? 'Hide' : 'Show'}</button>
    </div>
  );
}

function SignInForm({ onForgot, notice }: { onForgot: () => void; notice?: string }) {
  const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '', remember: true } });
  const { errors, isSubmitting } = form.formState;
  const call = useMutation({ mutationFn: signIn });
  // On success the server action redirects to Today, so there is no result to show.
  const submit = form.handleSubmit(async (values) => { const r = await call.mutateAsync(values); if (r) applyResult(form, r); });
  return (
    <form className="card" onSubmit={submit} noValidate>
      <Brand sub="Sign in to schedule your cartoons." />
      {notice && <p className="banner info" role="status">{notice}</p>}
      <FormError message={errors.root?.message} />
      <Field id="email" label="Email" error={errors.email}>
        <TextInput form={form} name="email" id="email" type="email" autoComplete="email" autoFocus />
      </Field>
      <Field id="password" label="Password" error={errors.password}>
        <PasswordInput form={form} name="password" id="password" autoComplete="current-password" />
      </Field>
      <div className="row-between">
        <label className="check"><input type="checkbox" {...form.register('remember')} />Keep me signed in</label>
        <button type="button" className="link small" onClick={onForgot}>Forgot password?</button>
      </div>
      <button className="btn primary" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

function SetupFormView({ needsCode }: { needsCode: boolean }) {
  const form = useForm<SetupForm>({ resolver: zodResolver(setupSchema), defaultValues: { name: '', email: '', password: '', confirm: '', code: '' } });
  const { errors, isSubmitting } = form.formState;
  const call = useMutation({ mutationFn: createOwner });
  const submit = form.handleSubmit(async (values) => { const r = await call.mutateAsync(values); if (r) applyResult(form, r); });
  return (
    <form className="card" onSubmit={submit} noValidate>
      <Brand sub="Create your account. You do this once; after that you sign in." />
      <FormError message={errors.root?.message} />
      <Field id="name" label="Your name" error={errors.name}>
        <TextInput form={form} name="name" id="name" autoComplete="name" autoFocus />
      </Field>
      <Field id="email" label="Email" error={errors.email}>
        <TextInput form={form} name="email" id="email" type="email" autoComplete="email" />
      </Field>
      <Field id="password" label="Password" hint="10+ characters, a letter and a number" error={errors.password}>
        <PasswordInput form={form} name="password" id="password" autoComplete="new-password" />
      </Field>
      <Field id="confirm" label="Type the password again" error={errors.confirm}>
        <PasswordInput form={form} name="confirm" id="confirm" autoComplete="new-password" />
      </Field>
      {needsCode && (
        <Field id="code" label="Setup code" hint="the CRON_SECRET you set in Vercel" error={errors.code}>
          <TextInput form={form} name="code" id="code" autoComplete="off" />
        </Field>
      )}
      <button className="btn primary" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create account'}</button>
    </form>
  );
}

function ResetFormView({ onDone, onBack }: { onDone: (message: string) => void; onBack: () => void }) {
  const form = useForm<ResetForm>({ resolver: zodResolver(resetSchema), defaultValues: { email: '', code: '', password: '', confirm: '' } });
  const call = useMutation({ mutationFn: resetPassword });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    const r = await call.mutateAsync(values);
    if (applyResult(form, r) && r.ok) onDone(r.message ?? 'Password changed.');
  });
  return (
    <form className="card" onSubmit={submit} noValidate>
      <Brand sub="Reset your password with the setup code: the CRON_SECRET you set in Vercel (or in .env.local on your laptop)." />
      <FormError message={errors.root?.message} />
      <Field id="email" label="Email" error={errors.email}>
        <TextInput form={form} name="email" id="email" type="email" autoComplete="email" autoFocus />
      </Field>
      <Field id="code" label="Setup code" error={errors.code}>
        <TextInput form={form} name="code" id="code" autoComplete="off" />
      </Field>
      <Field id="password" label="New password" hint="10+ characters, a letter and a number" error={errors.password}>
        <PasswordInput form={form} name="password" id="password" autoComplete="new-password" />
      </Field>
      <Field id="confirm" label="Type it again" error={errors.confirm}>
        <PasswordInput form={form} name="confirm" id="confirm" autoComplete="new-password" />
      </Field>
      <button className="btn primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Set new password'}</button>
      <button type="button" className="link small" onClick={onBack}>Back to sign in</button>
    </form>
  );
}

export function SignInView({ firstRun, needsCode, notice: first }: { firstRun: boolean; needsCode: boolean; notice?: string }) {
  const [screen, setScreen] = useState<Screen>('signin'); // which form is shown, not form data
  const [notice, setNotice] = useState(first);
  return (
    <main className="login">
      {firstRun ? <SetupFormView needsCode={needsCode} />
        : screen === 'reset' ? <ResetFormView onBack={() => setScreen('signin')} onDone={(m) => { setNotice(m); setScreen('signin'); }} />
        : <SignInForm notice={notice} onForgot={() => { setNotice(undefined); setScreen('reset'); }} />}
    </main>
  );
}
