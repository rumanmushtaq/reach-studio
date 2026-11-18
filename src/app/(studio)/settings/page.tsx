import { SettingsView } from '@/components/SettingsView';
import { currentOwner, supabaseServer } from '@/lib/supabase/server';
import { dueWork } from '@/lib/kick';
import { studioData } from '@/lib/view';

export default async function SettingsPage() {
  const d = await studioData();
  const { settings, now } = d;
  const owner = await currentOwner();
  const { data: factors } = await (await supabaseServer()).auth.mfa.listFactors();
  const twoStepOn = !!factors?.totp.some((f) => f.status === 'verified');
  return <SettingsView times={settings.times} channel={settings.channel} niche={settings.niche} links={settings.links} email={owner?.email ?? null} twoStepOn={twoStepOn} helperSeenAt={settings.helperSeenAt ?? null} now={now} latePosts={dueWork(d).late.length} />;
}
