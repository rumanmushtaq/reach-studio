'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { confirmTwoStep, startTwoStep, turnOffTwoStep } from '@/app/auth-actions';
import { mfaCodeSchema, type MfaCodeForm } from '@/lib/forms';
import { applyResult, Field, FormError, TextInput } from './forms';
import { useToast } from './ui';

// 2-step sign-in (Supabase MFA, TOTP): scan a QR code with an authenticator app, type one code to turn it on.
// After that, sign-in asks for the app's 6-digit code after the password.
export function TwoStepCard({ on }: { on: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const start = useMutation({ mutationFn: startTwoStep });
  const off = useMutation({ mutationFn: turnOffTwoStep });
  const form = useForm<MfaCodeForm>({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: '' } });
  const confirm = useMutation({ mutationFn: confirmTwoStep });
  const setup = start.data?.ok ? start.data : undefined;
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (v) => {
    if (!setup) return;
    try {
      const r = await confirm.mutateAsync({ ...v, factorId: setup.factorId });
      if (applyResult(form, r)) { toast(r.ok && r.message ? r.message : '2-step sign-in is on'); start.reset(); form.reset(); router.refresh(); }
    } catch {
      form.setError('root', { message: 'The studio did not answer. Try again.' });
    }
  });
  const turnOff = async () => {
    if (!window.confirm('Turn off 2-step sign-in? Sign-in will ask only for your password.')) return;
    const r = await off.mutateAsync().catch(() => ({ ok: false as const, error: 'The studio did not answer. Try again.' }));
    toast(r.ok ? r.message ?? '2-step sign-in is off' : r.error ?? 'Could not turn it off');
    router.refresh();
  };
  const startError = start.data && !start.data.ok ? start.data.error : start.isError ? 'The studio did not answer. Try again.' : undefined;

  return (
    <section className="card" aria-labelledby="twostep">
      <div className="row-between">
        <h2 id="twostep">2-step sign-in</h2>
        <span className={`pill ${on ? 'ok' : ''}`}>{on ? 'On' : 'Off'}</span>
      </div>
      <p className="small muted">
        {on
          ? 'After your password, sign-in asks for the 6-digit code from your authenticator app. Someone with only your password cannot get in.'
          : 'Adds a 6-digit code from an app like Google Authenticator, Microsoft Authenticator or 1Password after your password.'}
      </p>
      <FormError message={startError} />
      {on ? (
        <div className="inline"><button type="button" className="btn danger" onClick={turnOff} disabled={off.isPending}>{off.isPending ? 'Turning off…' : 'Turn off'}</button></div>
      ) : !setup ? (
        <div className="inline"><button type="button" className="btn" onClick={() => start.mutate()} disabled={start.isPending}>{start.isPending ? 'Preparing…' : 'Turn on 2-step sign-in'}</button></div>
      ) : (
        <form className="twostep" onSubmit={submit} noValidate>
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR code as an SVG data URL */}
          <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="qr" />
          <div className="twostep-steps">
            <ol className="small">
              <li>Open your authenticator app and add an account.</li>
              <li>Scan this QR code. Can’t scan? Type this key: <code className="mono">{setup.secret}</code></li>
              <li>Type the 6-digit code the app shows.</li>
            </ol>
            <FormError message={errors.root?.message} />
            <Field id="mfa-code" label="6-digit code" error={errors.code}>
              <TextInput form={form} name="code" id="mfa-code" className="input otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            </Field>
            <div className="inline">
              <button className="btn primary" disabled={isSubmitting}>{isSubmitting ? 'Checking…' : 'Turn on'}</button>
              <button type="button" className="btn ghost" onClick={() => { start.reset(); form.reset(); }}>Cancel</button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
