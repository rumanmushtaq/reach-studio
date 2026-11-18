import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite ships WASM and is only used locally; keep it out of the server bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Pages visited or prefetched in the last minute open from the browser's memory instead of the server.
  // Saving anything (server actions, router.refresh) clears this, so it never shows stale data after a change.
  experimental: { serverActions: { bodySizeLimit: '2mb' }, staleTimes: { dynamic: 60, static: 300 } },
  // The dev-tools badge sits over the rail's Sign out button.
  devIndicators: false,
  // Free slots now live on Today and in the planner.
  async redirects() { return [{ source: '/free-slots', destination: '/calendar', permanent: false }]; },
};

export default config;
