import type { Metadata, Viewport } from 'next';
import { QueryProvider } from '@/components/query';
import './globals.css';

export const metadata: Metadata = { title: 'Reach Studio', description: 'Add a cartoon. SEO and posting slots are added for you.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@500&display=swap"
        />
      </head>
      <body><QueryProvider>{children}</QueryProvider></body>
    </html>
  );
}
