'use client';

import { useActionState } from 'react';
import { login } from '../actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="login">
      <form className="card" action={action}>
        <div className="brand" style={{ padding: 0 }}><span className="logo">R</span><h1>Reach Studio</h1></div>
        <div className="field">
          <label htmlFor="password">Studio password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" autoFocus required />
        </div>
        {state?.error && <p className="err">{state.error}</p>}
        <button className="btn primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
