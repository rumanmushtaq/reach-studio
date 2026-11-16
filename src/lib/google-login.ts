import 'server-only';
import { env } from './env';

// "Continue with Google" for the studio itself: asks only for the email address, then checks it is
// one of OWNER_EMAILS. Separate from the YouTube connection, which asks for upload rights.

export const loginRedirectUri = () => `${env.APP_URL}/api/auth/google/callback`;

export function googleLoginUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: loginRedirectUri(), response_type: 'code',
    scope: 'openid email', state, prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Trades the sign-in code for the Google account's verified email address. */
export async function googleLoginEmail(code: string): Promise<string> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: loginRedirectUri(), grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google refused the sign-in (${tokenRes.status})`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } });
  if (!userRes.ok) throw new Error(`Google gave no account details (${userRes.status})`);
  const user = (await userRes.json()) as { email?: string; email_verified?: boolean };
  if (!user.email || !user.email_verified) throw new Error('This Google account has no verified email.');
  return user.email.toLowerCase();
}

export function isOwner(email: string): boolean {
  return env.OWNER_EMAILS.includes(email.toLowerCase());
}

/** Local development without a Google client: a one-click sign-in, never available in production. */
export function localSignInAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && !(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
