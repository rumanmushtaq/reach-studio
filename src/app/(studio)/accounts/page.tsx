import { AccountsView } from '@/components/AccountsView';
import { studioData } from '@/lib/view';

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const d = await studioData();
  const links = Object.values(d.settings.links).some((l) => !!l.trim());
  return <AccountsView connected={d.connected} setup={{ ...d.setup, links }} banner={await searchParams} />;
}
