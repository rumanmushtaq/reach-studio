'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import type { FieldError, FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { FormResult } from '@/lib/forms';

// Form building blocks for react-hook-form: a labelled field with its error, and a helper that copies
// the server's field errors back onto the form.

export function Field({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: FieldError; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{hint && <span className="muted" style={{ fontWeight: 400 }}>{hint}</span>}</label>
      {children}
      {error?.message && <span className="err" id={`${id}-error`} role="alert">{error.message}</span>}
    </div>
  );
}

/** A text input wired to react-hook-form, with aria attributes for its error. */
export function TextInput<T extends FieldValues>({ form, name, id, ...rest }: { form: UseFormReturn<T>; name: Path<T>; id: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'form' | 'name'>) {
  const error = name.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], form.formState.errors) as FieldError | undefined;
  return (
    <input
      className="input" id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
      {...form.register(name)} {...rest}
    />
  );
}

/** Puts a failed server result on the form: field errors on their fields, anything else as a form error. */
export function applyResult<T extends FieldValues>(form: UseFormReturn<T>, result: FormResult): boolean {
  if (result.ok) return true;
  for (const [field, message] of Object.entries(result.fields ?? {})) form.setError(field as Path<T>, { message });
  if (result.error) form.setError('root', { message: result.error });
  return false;
}

export function FormError({ message }: { message?: string }) {
  return message ? <p className="banner bad" role="alert">{message}</p> : null;
}
