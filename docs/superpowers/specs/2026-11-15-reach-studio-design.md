# Reach Studio — design

Date: 2026-11-15
Status: approved by owner ("Yes, start")

## Goal

One owner uploads a finished cartoon. The studio writes the SEO with Claude, books the next free daily
slot, and posts the video to YouTube, Facebook, Instagram and TikTok at that time without the owner's
laptop being on. Reach and subscribers are the success measure; the studio's job is zero manual steps
after "Add video".

Out of scope: writing scripts, making videos (the owner makes the cartoons), analytics, multiple users.

## Decisions

| Topic | Decision |
|---|---|
| Framework | One Next.js 15 app (App Router, TypeScript). Screens, API and jobs in one codebase. |
| Hosting | Owner's free Vercel Hobby account. Move to Pro when the channel earns money (Hobby is non-commercial). |
| Database | Postgres. Neon free tier in production. PGlite (embedded Postgres) for local dev and tests. Drizzle ORM. |
| Video files | Cloudflare R2 (S3 API). The browser uploads straight to R2 with a presigned URL. Local dev uses a disk folder. |
| Frames for Claude | Taken in the browser with `<video>` + canvas (4 JPEGs + 1 thumbnail), uploaded next to the video. No video processing on the server. |
| SEO | Claude API, model `claude-opus-5-5`, web search tool `web_search_20260209`, JSON output via `output_config.format`, server-side refusal fallback `fallbacks: "default"`. Basic draft when no API key or on failure. |
| Language | Titles mix Roman Urdu and English; descriptions end with one Urdu-script line. |
| Slots | Daily posting times set once (Pakistan time, UTC+5). Times limited to :00, :15, :30, :45. A new video takes the first free slot at least 1 hour away, right after its SEO is ready. |
| Jobs | `GET /api/cron/tick` runs due jobs. Called every 15 minutes by an external scheduler (cron-job.org or GitHub Actions) with `CRON_SECRET`. A daily Vercel cron runs cleanup and is also a safety net for the tick. |
| Posting | YouTube and Facebook: uploaded 6 hours early and scheduled natively (`publishAt`, `scheduled_publish_time`). Instagram: Reels container created 1 hour early from the R2 URL, published at the slot. TikTok: Upload-Post at the slot. |
| Cleanup | A video file is deleted the day after it is live on every chosen platform. Never while a post is failed or waiting. SEO, links and history stay. |
| Login | Single owner. `STUDIO_PASSWORD` env var, signed session cookie (`jose`). |
| Secrets | Platform tokens AES-256-GCM encrypted in the DB with `STUDIO_SECRET`. |

## Screens (from the approved demo)

- **Videos** — Add video panel (note + drop zone, several files at once), stats (next post, next free slot,
  free in 7 days), Coming up list, Posted list, storage box.
- **Video detail** — name and note, posting slot with "move to free slot", platform toggles with
  not-connected warnings, progress timeline, SEO tabs per platform with counters and Copy, "Write with
  Claude", links preview, remove video.
- **Calendar** — week view, booked/free/past slots, drag or tap-to-move.
- **Free slots** — next 14 free slots with "move a video here".
- **Accounts** — connect YouTube (Google OAuth), Facebook + Instagram (Meta OAuth), TikTok (Upload-Post API key).
- **Settings** — daily times, channel name and niche, channel links.

## Data model

- `settings` (single row): times[], channel, niche, links{youtube, instagram, facebook, tiktok}.
- `accounts`: platform (youtube | facebook | instagram | tiktok), external id, name, encrypted tokens, connected_at.
- `videos`: id, name, note, file_key, file_size, mime, duration, width, height, shape, thumb_key, frame_keys[],
  platforms{}, seo (json), seo_source (claude | draft), seo_state (pending | working | ready), seo_note,
  slot_at, file_deleted_at, created_at.
- `posts`: id, video_id, platform, state (waiting | staged | scheduled | live | failed), run_at, attempts,
  last_error, external_id, url, updated_at. One row per video × chosen platform.

## Post state machine

```
waiting --(slot-6h, YT/FB: upload + native schedule)--> scheduled --(slot)--> live
waiting --(slot-1h, IG: create container)--> staged --(slot: media_publish)--> live
waiting --(slot, TikTok: Upload-Post)--> live
any step error: attempts++, run_at = now + 15 min * attempts; after 4 attempts -> failed (shown with Retry)
AuthError: failed at once with "Reconnect <platform>"
```

Moving a slot resets waiting/staged posts and, for scheduled YouTube/Facebook posts, updates the
scheduled time on the platform.

## Error handling

- Claude unavailable or invalid output: basic draft SEO, slot still booked, banner on the video.
- Upload interrupted: video stays "Uploading" with a Resume/Remove choice; nothing is booked.
- Tick runs one job at a time and stops starting new jobs after 240 s of its 300 s limit.
- Every external call maps errors to AuthError (reconnect) or PublishError(retryable).

## Testing

- Vitest: slot maths, SEO normalising and limits, post state machine, cleanup selection, crypto.
- Publisher unit tests with mocked fetch/googleapis.
- Playwright (1 worker): add video → SEO draft → slot booked → move on calendar → settings change.

## Build plan

1. Scaffold Next.js app, Tailwind-free CSS ported from the demo, Drizzle schema, PGlite/Neon switch, login.
2. Domain logic with tests: slots, SEO normalise/draft/limits, post planner, cleanup.
3. Storage (R2 + local), upload API (presign → complete), browser frame capture.
4. Claude SEO service and `/api/videos/[id]/seo`.
5. Jobs: tick route, post planner, cleanup, retry.
6. Publishers (YouTube, Facebook, Instagram, Upload-Post) and OAuth connect flows.
7. Screens: Videos, Detail, Calendar, Free slots, Accounts, Settings.
8. End-to-end test, README with Vercel + Neon + R2 + Google + Meta + Upload-Post + cron setup.
