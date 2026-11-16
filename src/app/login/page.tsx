'use client';

import { useActionState } from 'react';
import { login } from '../actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="login">
      <form className="card" action={action}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="logo">R</span><h1 style={{ fontSize: 24, fontWeight: 800 }}>Reach Studio</h1></div>
        <p className="small muted">Your cartoons, scheduled everywhere.</p>
        <div className="field">
          <label htmlFor="password">Studio password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" autoFocus required />
        </div>
        {state?.error && <p className="err" role="alert">{state.error}</p>}
        <button className="btn primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
