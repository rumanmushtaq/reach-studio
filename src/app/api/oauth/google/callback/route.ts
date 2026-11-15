import { encrypt } from '@/lib/crypto';
import { backToAccounts, checkState } from '@/lib/oauth';
import { googleExchange } from '@/lib/publishers/youtube';
import { saveAccount } from '@/lib/repo';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get('error')) return backToAccounts('YouTube sign-in was cancelled.', false);
  if (!(await checkState(q.get('state')))) return backToAccounts('Sign-in expired. Press Connect YouTube again.', false);
  try {
    const { tokens, channel } = await googleExchange(q.get('code') ?? '');
    if (!tokens.refresh_token) return backToAccounts('Google gave no refresh token. Remove the app at myaccount.google.com/permissions and connect again.', false);
    await saveAccount({ platform: 'youtube', externalId: channel.id, name: channel.title, tokens: encrypt(JSON.stringify(tokens)), connectedAt: Date.now() });
    return backToAccounts(`YouTube connected: ${channel.title}`, true);
  } catch (err) {
    return backToAccounts(`YouTube sign-in failed: ${(err as Error).message}`, false);
  }
}
