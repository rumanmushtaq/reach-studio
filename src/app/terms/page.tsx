import type { Metadata } from 'next';
import { CONTACT_EMAIL, LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Terms of service · Reach Studio' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        Reach Studio is a private tool for its owner to schedule and post their own videos. By connecting an
        account you agree to these terms.
      </p>

      <h2>Your content</h2>
      <p>
        You own the videos you upload. You confirm you have the right to post them, and that they follow the
        rules of each platform they go to (YouTube, Facebook, Instagram and TikTok).
      </p>

      <h2>Posting for you</h2>
      <p>
        When you connect a platform, you allow Reach Studio to post the videos you add, at the times you
        choose, with the titles and descriptions shown in the studio. You can disconnect any platform at any time.
      </p>

      <h2>No guarantee</h2>
      <p>
        The studio is provided as it is. Platforms can change their rules or reject a post; the studio shows
        what happened but cannot promise every post goes live.
      </p>

      <h2>Contact</h2>
      <p>Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}
