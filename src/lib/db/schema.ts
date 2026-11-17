import { bigint, integer, jsonb, pgTable, real, text, uniqueIndex } from 'drizzle-orm/pg-core';
import type { Links, Platform, Research, Seo } from '../seo';

// Times are epoch milliseconds.

export const settings = pgTable('settings', {
  id: integer('id').primaryKey(),
  times: jsonb('times').$type<string[]>().notNull(),
  channel: text('channel').notNull(),
  niche: text('niche').notNull(),
  links: jsonb('links').$type<Links>().notNull(),
  helperSeenAt: bigint('helper_seen_at', { mode: 'number' }), // last call from the Claude helper on the laptop
});

// The owner's profile. Sign-in itself (email, password, 2-step) lives in Supabase Auth; `id` is the
// Supabase user id. Created when the email is verified, updated on each sign-in.
export const profiles = pgTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  lastSignInAt: bigint('last_sign_in_at', { mode: 'number' }),
});

export const accounts = pgTable('accounts', {
  platform: text('platform').$type<Platform>().primaryKey(),
  externalId: text('external_id').notNull(),
  name: text('name').notNull(),
  tokens: text('tokens').notNull(), // AES-256-GCM, see crypto.ts
  connectedAt: bigint('connected_at', { mode: 'number' }).notNull(),
});

export type UploadState = 'uploading' | 'ready';
export type SeoState = 'pending' | 'working' | 'ready';
export type SeoSource = 'claude' | 'draft';

export const videos = pgTable('videos', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  note: text('note').notNull().default(''),
  fileName: text('file_name').notNull(),
  fileKey: text('file_key').notNull(),
  fileSize: bigint('file_size', { mode: 'number' }).notNull(),
  mime: text('mime').notNull(),
  duration: real('duration'),
  width: integer('width'),
  height: integer('height'),
  shape: text('shape').$type<'vertical' | 'horizontal'>().notNull(),
  thumbKey: text('thumb_key'),
  customThumbKey: text('custom_thumb_key'), // owner's own YouTube thumbnail
  frameKeys: jsonb('frame_keys').$type<string[]>().notNull().default([]),
  platforms: jsonb('platforms').$type<Record<Platform, boolean>>().notNull(),
  uploadState: text('upload_state').$type<UploadState>().notNull(),
  seo: jsonb('seo').$type<Seo>(),
  seoSource: text('seo_source').$type<SeoSource>(),
  seoState: text('seo_state').$type<SeoState>().notNull(),
  seoNote: text('seo_note'),
  seoStartedAt: bigint('seo_started_at', { mode: 'number' }),
  seoAt: bigint('seo_at', { mode: 'number' }),
  // Waiting for the Claude helper to write the SEO (it replaces the basic draft), and when it took the job.
  claudeWantedAt: bigint('claude_wanted_at', { mode: 'number' }),
  research: jsonb('research').$type<Research>(), // Claude's market research for this video
  claudeClaimedAt: bigint('claude_claimed_at', { mode: 'number' }),
  slotAt: bigint('slot_at', { mode: 'number' }),
  fileDeletedAt: bigint('file_deleted_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
}, (t) => [uniqueIndex('videos_slot_at').on(t.slotAt)]);

export type PostState = 'waiting' | 'staged' | 'scheduled' | 'live' | 'failed';

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  videoId: text('video_id').notNull().references(() => videos.id, { onDelete: 'cascade' }),
  platform: text('platform').$type<Platform>().notNull(),
  state: text('state').$type<PostState>().notNull(),
  runAt: bigint('run_at', { mode: 'number' }).notNull(),
  lockedUntil: bigint('locked_until', { mode: 'number' }),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  externalId: text('external_id'), // platform video/media id, or the Instagram container while staged
  url: text('url'),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, (t) => [uniqueIndex('posts_video_platform').on(t.videoId, t.platform)]);

export type VideoRow = typeof videos.$inferSelect;
export type PostRow = typeof posts.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;

// Created on first use (single-owner app, no migration tool needed). Keep in step with the tables above.
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  id integer PRIMARY KEY, times jsonb NOT NULL, channel text NOT NULL, niche text NOT NULL, links jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL,
  last_sign_in_at bigint
);
CREATE TABLE IF NOT EXISTS accounts (
  platform text PRIMARY KEY, external_id text NOT NULL, name text NOT NULL, tokens text NOT NULL, connected_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS videos (
  id text PRIMARY KEY, name text NOT NULL, note text NOT NULL DEFAULT '', file_name text NOT NULL, file_key text NOT NULL,
  file_size bigint NOT NULL, mime text NOT NULL, duration real, width integer, height integer, shape text NOT NULL,
  thumb_key text, frame_keys jsonb NOT NULL DEFAULT '[]', platforms jsonb NOT NULL, upload_state text NOT NULL,
  seo jsonb, seo_source text, seo_state text NOT NULL, seo_note text, seo_started_at bigint, seo_at bigint,
  slot_at bigint, file_deleted_at bigint, created_at bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS videos_slot_at ON videos (slot_at);
ALTER TABLE videos ADD COLUMN IF NOT EXISTS custom_thumb_key text;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS claude_wanted_at bigint;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS claude_claimed_at bigint;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS research jsonb;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS helper_seen_at bigint;
CREATE TABLE IF NOT EXISTS posts (
  id text PRIMARY KEY, video_id text NOT NULL REFERENCES videos(id) ON DELETE CASCADE, platform text NOT NULL,
  state text NOT NULL, run_at bigint NOT NULL, locked_until bigint, attempts integer NOT NULL DEFAULT 0,
  last_error text, external_id text, url text, updated_at bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS posts_video_platform ON posts (video_id, platform);
`;
