import type { Metadata } from 'next';
import { CONTACT_EMAIL, LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy policy · Reach Studio' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Reach Studio is a private tool its owner uses to schedule and post their own cartoons to YouTube,
        Facebook, Instagram and TikTok. Only the owner can sign in. This page explains what it stores and why.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><b>Your sign-in:</b> your name, email and password, handled by Supabase Auth. We never see your password.</li>
        <li><b>Your videos:</b> the files you upload, their titles, descriptions, tags and posting times. Files are kept in Cloudinary until they are posted everywhere, then deleted.</li>
        <li><b>Connected accounts:</b> the access tokens YouTube, Facebook, Instagram and TikTok give us when you connect them. They are stored encrypted (AES-256-GCM) and used only to post your videos.</li>
      </ul>

      <h2>Google user data</h2>
      <p>
        When you connect YouTube, Reach Studio asks Google for permission to upload videos to your channel and to
        manage their playlists and first comment (<code>youtube.upload</code> and <code>youtube.force-ssl</code>).
        We use this access only to publish the videos you add, at the times you choose. We do not read your
        other videos, your subscribers or any other Google data.
      </p>
      <p>
        Reach Studio&apos;s use and transfer of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>,
        including the Limited Use requirements.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Nobody, except the services that run the studio: Supabase (database and sign-in), Cloudinary (video
        storage), Vercel (hosting), the platforms you post to, and Claude (Anthropic), which reads a video&apos;s
        name, note and a few still frames to write its title and description. We do not sell data or use it for ads.
      </p>

      <h2>Removing your data</h2>
      <p>
        Disconnect an account on the Accounts page at any time; its tokens are deleted. You can also remove
        Reach Studio&apos;s access from your Google account at{' '}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.
        To delete everything, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Contact</h2>
      <p>Questions about this policy: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}
