import 'server-only';

// Every setting the studio reads. Only STUDIO_PASSWORD and STUDIO_SECRET are required to start;
// each platform lights up when its own keys are present.
function read(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  get APP_URL() { return read('APP_URL', 'http://localhost:3100').replace(/\/$/, ''); },
  get STUDIO_PASSWORD() { return read('STUDIO_PASSWORD'); },
  get STUDIO_SECRET() { return read('STUDIO_SECRET'); },
  get CRON_SECRET() { return read('CRON_SECRET'); },
  // postgres://… (Neon) or a PGlite folder path, or memory:// for tests.
  get DATABASE_URL() { return read('DATABASE_URL', './data/pglite'); },

  get ANTHROPIC_API_KEY() { return read('ANTHROPIC_API_KEY'); },

  // Cloudinary: cloudinary://<api_key>:<api_secret>@<cloud_name>. Used before R2 when set.
  get CLOUDINARY_URL() { return read('CLOUDINARY_URL'); },

  // Cloudflare R2. Without these or Cloudinary, files go to ./data/files (local dev only).
  get R2_ACCOUNT_ID() { return read('R2_ACCOUNT_ID'); },
  get R2_ACCESS_KEY_ID() { return read('R2_ACCESS_KEY_ID'); },
  get R2_SECRET_ACCESS_KEY() { return read('R2_SECRET_ACCESS_KEY'); },
  get R2_BUCKET() { return read('R2_BUCKET'); },

  get GOOGLE_CLIENT_ID() { return read('GOOGLE_CLIENT_ID'); },
  get GOOGLE_CLIENT_SECRET() { return read('GOOGLE_CLIENT_SECRET'); },
  get META_APP_ID() { return read('META_APP_ID'); },
  get META_APP_SECRET() { return read('META_APP_SECRET'); },
  get META_CONFIG_ID() { return read('META_CONFIG_ID'); },
  get META_GRAPH_VERSION() { return read('META_GRAPH_VERSION', 'v23.0'); },
};

export const has = {
  claude: () => !!env.ANTHROPIC_API_KEY,
  cloudinary: () => /^cloudinary:\/\/[^:]+:[^@]+@.+/.test(env.CLOUDINARY_URL),
  r2: () => !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET),
  google: () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  meta: () => !!(env.META_APP_ID && env.META_APP_SECRET),
  storage: () => has.cloudinary() || has.r2(),
};
