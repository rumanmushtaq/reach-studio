import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite ships WASM and is only used locally; keep it out of the server bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  // The dev-tools badge sits over the rail's Sign out button.
  devIndicators: false,
  // Free slots now live on Today and in the planner.
  async redirects() { return [{ source: '/free-slots', destination: '/calendar', permanent: false }]; },
};

export default config;
