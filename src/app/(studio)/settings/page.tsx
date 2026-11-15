import { SettingsView } from '@/components/SettingsView';
import { studioData } from '@/lib/view';

export default async function SettingsPage() {
  const { settings } = await studioData();
  return <SettingsView times={settings.times} channel={settings.channel} niche={settings.niche} links={settings.links} />;
}
