'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { addTime, removeTime, saveChannel } from '@/app/actions';
import { changePassword } from '@/app/auth-actions';
import {
  changePasswordSchema, channelSchema, timeSchema, type ChangePasswordForm, type ChannelForm, type TimeForm,
} from '@/lib/forms';
import { PLATFORM_NAMES, PLATFORMS, type Links } from '@/lib/seo';
import { QUARTER_HOURS, timeLabel } from '@/lib/slots';
import { applyResult, Field, FormError, TextInput } from './forms';
import { useAction } from './query';
import { TwoStepCard } from './TwoStepCard';
import { PlatformBadge, useToast } from './ui';

export function SettingsView({ times, channel, niche, links, email, twoStepOn }: { times: string[]; channel: string; niche: string; links: Links; email: string | null; twoStepOn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { run, pending } = useAction('Saved');
  const addTimeCall = useMutation({ mutationFn: addTime });
  const saveChannelCall = useMutation({ mutationFn: saveChannel });
  const changePasswordCall = useMutation({ mutationFn: changePassword });

  const timeForm = useForm<TimeForm>({ resolver: zodResolver(timeSchema), defaultValues: { time: '12:00' } });
  const chanForm = useForm<ChannelForm>({ resolver: zodResolver(channelSchema), values: { channel, niche, links } });
  const pwForm = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordSchema), defaultValues: { current: '', password: '', confirm: '' } });

  const submitTime = timeForm.handleSubmit(async (v) => {
    const r = await addTimeCall.mutateAsync(v);
    if (applyResult(timeForm, r)) { toast(r.ok && r.message ? r.message : 'Daily time added'); router.refresh(); }
  });
  const submitChannel = chanForm.handleSubmit(async (v) => {
    const r = await saveChannelCall.mutateAsync(v);
    if (applyResult(chanForm, r)) { toast('Saved'); router.refresh(); }
  });
  const submitPassword = pwForm.handleSubmit(async (v) => {
    const r = await changePasswordCall.mutateAsync(v);
    if (applyResult(pwForm, r)) { toast(r.ok && r.message ? r.message : 'Password changed'); pwForm.reset(); }
  });

  const ce = chanForm.formState.errors;
  const pe = pwForm.formState.errors;

  return (
    <>
      <header className="head"><div><h1>Settings</h1><p className="small muted">Set these once. They apply to every new video.</p></div></header>

      <section className="card" aria-labelledby="times">
        <h2 id="times">Daily posting times</h2>
        <p className="small muted">Every day gets these slots, in Pakistan time. New videos take the next free one. Changing them does not move videos already booked.</p>
        <div className="timechips">
          {times.map((t) => (
            <span className="timechip" key={t}>{timeLabel(t)}
              <button aria-label={`Remove ${timeLabel(t)}`} disabled={times.length < 2 || pending} onClick={() => run(() => removeTime(t))}>×</button>
            </span>
          ))}
        </div>
        <form className="inline" onSubmit={submitTime} noValidate>
          <label><span className="sr-only">New daily time</span>
            <select className="input" aria-label="New daily time" aria-invalid={!!timeForm.formState.errors.time} {...timeForm.register('time')}>
              {QUARTER_HOURS.map((q) => <option key={q} value={q}>{timeLabel(q)}</option>)}
            </select>
          </label>
          <button className="btn" disabled={timeForm.formState.isSubmitting}>Add daily time</button>
          {timeForm.formState.errors.time && <span className="err" role="alert">{timeForm.formState.errors.time.message}</span>}
        </form>
      </section>

      <form className="card" onSubmit={submitChannel} aria-labelledby="chan" noValidate>
        <h2 id="chan">Channel</h2>
        <p className="small muted">Claude uses these when it writes titles and descriptions.</p>
        <FormError message={ce.root?.message} />
        <div className="grid2">
          <Field id="s-channel" label="Channel name" error={ce.channel}><TextInput form={chanForm} name="channel" id="s-channel" /></Field>
          <Field id="s-niche" label="What the channel is about" error={ce.niche}><TextInput form={chanForm} name="niche" id="s-niche" /></Field>
        </div>
        <h2 style={{ marginTop: 8 }}>Your links</h2>
        <p className="small muted">Added to the end of every YouTube and Facebook description, so viewers find your other channels.</p>
        <div className="grid2">
          {PLATFORMS.map((p) => (
            <Field key={p} id={`l-${p}`} label={<span className="inline"><PlatformBadge p={p} small />{PLATFORM_NAMES[p]} link</span>} error={ce.links?.[p]}>
              <TextInput form={chanForm} name={`links.${p}`} id={`l-${p}`} type="url" placeholder="https://" />
            </Field>
          ))}
        </div>
        <div className="inline">
          <button className="btn primary" disabled={chanForm.formState.isSubmitting || !chanForm.formState.isDirty}>Save</button>
          {chanForm.formState.isDirty && <span className="small muted">Unsaved changes</span>}
        </div>
      </form>

      <form className="card" onSubmit={submitPassword} aria-labelledby="pw" noValidate>
        <h2 id="pw">Sign-in</h2>
        <p className="small muted">{email ? <>Signed in as <b>{email}</b>. </> : null}Change your password here. Forgot it? Use “Forgot password?” on the sign-in page and we email you a link.</p>
        <FormError message={pe.root?.message} />
        <input type="email" autoComplete="username" value={email ?? ''} readOnly hidden />
        <div className="grid2">
          <Field id="pw-current" label="Current password" error={pe.current}><TextInput form={pwForm} name="current" id="pw-current" type="password" autoComplete="current-password" /></Field>
          <span aria-hidden="true" />
          <Field id="pw-new" label="New password" hint="10+ characters, a letter and a number" error={pe.password}><TextInput form={pwForm} name="password" id="pw-new" type="password" autoComplete="new-password" /></Field>
          <Field id="pw-confirm" label="Type it again" error={pe.confirm}><TextInput form={pwForm} name="confirm" id="pw-confirm" type="password" autoComplete="new-password" /></Field>
        </div>
        <div className="inline"><button className="btn" disabled={pwForm.formState.isSubmitting}>{pwForm.formState.isSubmitting ? 'Saving…' : 'Change password'}</button></div>
      </form>

      <TwoStepCard on={twoStepOn} />
    </>
  );
}
