# Reach Studio

Add a finished cartoon. The studio writes the SEO with Claude, books the next free daily slot, and posts
the video to YouTube, Facebook, Instagram and TikTok at that time. Your laptop can be off.

## How it works

1. **Add video** (Videos page). The browser reads the video, takes 4 frames and a thumbnail, and uploads
   everything straight to storage.
2. **SEO** starts as soon as the upload finishes. Claude looks at the frames, searches the web for
   current kids' cartoon search words, and writes Urdu + English text for each platform (about a minute).
   Without a Claude key the studio writes a basic draft.
3. **Slot**: right after the SEO is ready, the video takes the next free daily slot (Pakistan time).
   Move it on the Calendar or the Free slots page.
4. **Posting**:
   - 6 hours before the slot, YouTube and Facebook get the video, scheduled to go public at the slot.
   - 1 hour before, Instagram gets the Reel to process.
   - At the slot, Instagram publishes and TikTok posts through Upload-Post.
   - A failed post retries 3 times, then shows **Retry** on the video.
5. **Cleanup**: the day after a video is live on every chosen platform, its video file is deleted.
   Its SEO, links and thumbnail stay.

The job runner is `/api/cron/tick`. Something must call it every 15 minutes (step 7).

## Run it on your laptop

Needs Node 20 or newer.

```bash
cp .env.example .env.local
```

Fill in `STUDIO_PASSWORD`, `STUDIO_SECRET`, `CRON_SECRET` and `APP_URL=http://localhost:3100`.
Leave the database and R2 lines empty: locally the studio uses `./data`.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3100. Platforms cannot fetch videos from your laptop, so real posting needs the
deployed version.

Tests:

```bash
npm test
```

```bash
npx playwright test
```

(The second one needs `npm run dev` running.)

## Deploy on Vercel (free Hobby plan)

Vercel's Hobby plan is for personal, non-commercial use. When the channel earns money, move to Pro.

### 1. Database: Neon

1. In Vercel: your project → **Storage** → **Create** → **Neon** (free). Or sign up at neon.tech.
2. Copy the connection string (`postgres://…`) into `DATABASE_URL`.

The tables are created on first use.

### 2. Video storage: Cloudflare R2

1. Cloudflare dashboard → **R2** → **Create bucket**, e.g. `reach-studio`.
2. **R2 → Manage API tokens → Create token** with *Object Read & Write* on that bucket.
   Put the values in `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`.
3. Bucket → **Settings → CORS policy**, so the browser can upload directly:

```json
[{ "AllowedOrigins": ["https://YOUR-APP.vercel.app"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
```

### 3. Claude

Create an API key at console.anthropic.com and set `ANTHROPIC_API_KEY`. The studio uses Claude Opus 5.5
with web search. The cost is a few cents per video.

### 4. YouTube

1. console.cloud.google.com → new project → enable **YouTube Data API v3**.
2. **OAuth consent screen**: External. Add your Google account as a test user.
3. **Credentials → Create OAuth client ID** → *Web application*. Add this redirect URI:
   `https://YOUR-APP.vercel.app/api/oauth/google/callback`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Apply for the **YouTube API audit** (Google's "YouTube API Services – Audit and Quota Extension"
   form). Until Google approves it, YouTube keeps API uploads private.

Cartoons are uploaded as **made for kids**, as YouTube requires. That turns comments off on them.

### 5. Facebook and Instagram

1. developers.facebook.com → **Create app** → type *Business*.
2. Add **Facebook Login for Business**. Redirect URI:
   `https://YOUR-APP.vercel.app/api/oauth/meta/callback`.
3. Your Instagram must be a **Business or Creator** account linked to your Facebook Page.
4. Set `META_APP_ID` and `META_APP_SECRET`. Set `META_CONFIG_ID` too if you made a Login configuration.

While the app is in development mode it can post to Pages you manage, which covers your own channel.

### 6. TikTok

Sign up at upload-post.com, connect your TikTok there, and create an API key. In the studio, go to
**Accounts → TikTok** and enter the key and the profile name you gave it on Upload-Post.

### 7. Deploy and start the job runner

1. Push this folder to GitHub and import it in Vercel.
2. Add all the environment variables from `.env.example` (`APP_URL` = your Vercel address).
3. Deploy, open the app, sign in, and connect the accounts on the **Accounts** page.
4. Call the job runner every 15 minutes. Free option: **cron-job.org** → new cron job →
   URL `https://YOUR-APP.vercel.app/api/cron/tick` → every 15 minutes →
   header `Authorization: Bearer <your CRON_SECRET>`.

`vercel.json` also runs it once a day as a safety net. If you use GitHub, `.github/workflows/tick.yml`
can call it too: set the repository secrets `STUDIO_URL` and `CRON_SECRET`.

## Limits to know

- Posting times are on the quarter hour (7:00, 7:15 …) because the job runner runs every 15 minutes.
- YouTube and Facebook go live at the exact minute. Instagram and TikTok go live within a few minutes
  of the slot.
- R2's free tier is 10 GB. With next-day cleanup, a week of long cartoons booked ahead fits easily.
- If you remove a video after it was uploaded early, delete it on YouTube or Facebook too.
