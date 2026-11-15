import { AccountsView } from '@/components/AccountsView';
import { studioData } from '@/lib/view';

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const d = await studioData();
  return <AccountsView connected={d.connected} setup={{ google: d.setup.google, meta: d.setup.meta }} banner={await searchParams} />;
}
