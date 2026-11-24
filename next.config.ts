import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite ships WASM and is only used locally; keep it out of the server bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  // No staleTimes: every page is read fresh from the server, so all pages always show the same data.
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  // The dev-tools badge sits over the rail's Sign out button.
  devIndicators: false,
  // The TikTok helper download zips these files at request time.
  outputFileTracingIncludes: { '/api/tiktok-helper': ['./extensions/tiktok-helper/*'] },
  // Free slots now live on Today and in the planner.
  async redirects() { return [{ source: '/free-slots', destination: '/calendar', permanent: false }]; },
};

export default config;
