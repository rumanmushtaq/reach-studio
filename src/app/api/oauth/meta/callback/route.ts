import { encrypt } from '@/lib/crypto';
import { backToAccounts, checkState } from '@/lib/oauth';
import { metaExchange } from '@/lib/publishers/meta';
import { saveAccount } from '@/lib/repo';

// One Meta sign-in connects the Facebook Page and its linked Instagram account.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get('error')) return backToAccounts('Facebook sign-in was cancelled.', false);
  if (!(await checkState(q.get('state')))) return backToAccounts('Sign-in expired. Press Connect Facebook again.', false);
  try {
    const pages = await metaExchange(q.get('code') ?? '');
    if (!pages.length) return backToAccounts('No Facebook Page found. Create a Page, or tick it during sign-in.', false);
    const page = pages.find((p) => p.instagram) ?? pages[0];
    const tokens = encrypt(JSON.stringify({ accessToken: page.pageToken }));
    const now = Date.now();
    await saveAccount({ platform: 'facebook', externalId: page.pageId, name: page.pageName, tokens, connectedAt: now });
    if (page.instagram) {
      await saveAccount({ platform: 'instagram', externalId: page.instagram.id, name: '@' + page.instagram.username, tokens, connectedAt: now });
      return backToAccounts(`Connected ${page.pageName} and Instagram @${page.instagram.username}`, true);
    }
    return backToAccounts(`Connected ${page.pageName}. No Instagram Business account is linked to this Page.`, true);
  } catch (err) {
    return backToAccounts(`Facebook sign-in failed: ${(err as Error).message}`, false);
  }
}
