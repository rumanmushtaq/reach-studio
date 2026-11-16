import { jwtVerify, SignJWT } from 'jose';

// Owner login (Google). Works in middleware (edge) and on the server, so it reads process.env directly.
export const SESSION_COOKIE = 'rs_session';
const MAX_AGE_DAYS = 30;

function secret(): Uint8Array {
  const s = process.env.STUDIO_SECRET?.trim();
  if (!s) throw new Error('STUDIO_SECRET is not set');
  return new TextEncoder().encode(s);
}

export async function createSession(email: string): Promise<{ token: string; maxAge: number }> {
  const maxAge = MAX_AGE_DAYS * 24 * 3600;
  const token = await new SignJWT({ owner: true, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_DAYS}d`)
    .sign(secret());
  return { token, maxAge };
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}
