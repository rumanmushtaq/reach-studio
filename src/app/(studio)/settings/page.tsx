import { cookies } from 'next/headers';
import { SettingsView } from '@/components/SettingsView';
import { SESSION_COOKIE, sessionEmail } from '@/lib/session';
import { studioData } from '@/lib/view';

export default async function SettingsPage() {
  const { settings } = await studioData();
  const email = await sessionEmail((await cookies()).get(SESSION_COOKIE)?.value);
  return <SettingsView times={settings.times} channel={settings.channel} niche={settings.niche} links={settings.links} email={email} />;
}
