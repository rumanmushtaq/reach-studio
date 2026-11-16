import 'server-only';

// Every setting the studio reads. STUDIO_SECRET and CRON_SECRET are needed to sign in;
// each platform lights up when its own keys are present.
function read(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  get APP_URL() { return read('APP_URL', 'http://localhost:3100').replace(/\/$/, ''); },
  get STUDIO_SECRET() { return read('STUDIO_SECRET'); },
  get CRON_SECRET() { return read('CRON_SECRET'); },
  // postgres://… (Supabase) or a PGlite folder path, or memory:// for tests.
  get SUPABASE_DATABASE_URL() { return read('SUPABASE_DATABASE_URL', './data/pglite'); },

  // Cloudinary: cloudinary://<api_key>:<api_secret>@<cloud_name>. Without it, files go to ./data/files (local dev only).
  get CLOUDINARY_URL() { return read('CLOUDINARY_URL'); },

  get GOOGLE_CLIENT_ID() { return read('GOOGLE_CLIENT_ID'); },
  get GOOGLE_CLIENT_SECRET() { return read('GOOGLE_CLIENT_SECRET'); },
  get META_APP_ID() { return read('META_APP_ID'); },
  get META_APP_SECRET() { return read('META_APP_SECRET'); },
  get META_CONFIG_ID() { return read('META_CONFIG_ID'); },
  get META_GRAPH_VERSION() { return read('META_GRAPH_VERSION', 'v23.0'); },
};

export const has = {
  cloudinary: () => /^cloudinary:\/\/[^:]+:[^@]+@.+/.test(env.CLOUDINARY_URL),
  google: () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  meta: () => !!(env.META_APP_ID && env.META_APP_SECRET),
  storage: () => has.cloudinary(),
};
