import { encrypt } from '@/lib/crypto';
import { backToAccounts, checkState } from '@/lib/oauth';
import { googleExchange } from '@/lib/publishers/youtube';
import { saveAccount } from '@/lib/repo';

// Google's sign-in comes back here. Each step has its own time limit, so a failure names the step.
export const maxDuration = 60;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get('error')) return backToAccounts('YouTube sign-in was cancelled.', false);
  if (!(await checkState(q.get('state')))) return backToAccounts('Sign-in expired. Press Connect YouTube again.', false);
  try {
    const { tokens, channel } = await googleExchange(q.get('code') ?? '');
    if (!tokens.refresh_token) return backToAccounts('Google gave no refresh token. Remove the app at myaccount.google.com/permissions and connect again.', false);
    const saved = saveAccount({ platform: 'youtube', externalId: channel.id, name: channel.title, tokens: encrypt(JSON.stringify(tokens)), connectedAt: Date.now() });
    await Promise.race([saved, new Promise((_, no) => setTimeout(() => no(new Error('the database did not answer when saving the account')), 15_000))]);
    return backToAccounts(`YouTube connected: ${channel.title}`, true);
  } catch (err) {
    return backToAccounts(`YouTube sign-in failed: ${(err as Error).message}`, false);
  }
}
