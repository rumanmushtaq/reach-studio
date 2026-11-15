import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite ships WASM and is only used locally; keep it out of the server bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};

export default config;
