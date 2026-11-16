# Reach Studio

Add a finished cartoon. The studio writes the SEO with Claude, books the next free daily slot, and posts
the video to YouTube, Facebook, Instagram and TikTok at that time. Posting works with your laptop off;
Claude writes the SEO through your own Claude account while the helper runs on your laptop.

You sign in with Google. There is no password to set.

## How it works

- **Today**: the home page. A countdown to the next post, a **Needs you** box with one fix button per problem
  (failed post, account not connected, unfinished upload), and the next 7 days grouped by day, with free
  slots shown inline. Each video shows where each platform stands.
- **Add videos** (the orange button): drop one or more cartoons and choose when they go live:
  next free slots, tonight, this weekend, or a date and time you pick. Each video shows its steps live:
  read, uploaded, SEO by Claude, booked.
- **Video page**: a preview of how the post looks on each platform, a **Reach checklist** of what to
  improve, the text editor (tags and hashtags as chips), the posting time with one-tap moves, each
  platform's status, and a custom YouTube thumbnail upload (YouTube allows these on verified channels).
- **Planner**: the week as a grid. Drag a video to a free slot, or tap it and tap the slot. Every move
  shows an Undo for 10 seconds.
- **Library**: every video, with search and filters (coming up, live, needs you).

Behind the screens:

1. The browser reads each video, takes 4 frames and a thumbnail, and uploads straight to storage.
2. The studio writes a basic SEO draft at once, so the video never waits. Then the **Claude helper** on
   your laptop (`npm run claude-helper`) picks the video up: Claude Code, signed in with your Claude
   account, looks at the frames, searches the web for current kids' cartoon search words, and writes Urdu +
   English text for each platform (a minute or two). It replaces the draft if posting has not started.
   Your own edits to the text cancel a waiting rewrite.
3. The video takes the next free daily slot (Pakistan time), or keeps the time you picked.
4. 6 hours before the slot, YouTube and Facebook get the video, scheduled to go public at the slot.
   1 hour before, Instagram gets the Reel to process. At the slot, Instagram publishes and TikTok posts
   through Upload-Post. A failed post retries 3 times, then shows on Today.
5. The day after a video is live on every chosen platform, its video file is deleted. Its SEO, links and
   thumbnail stay.

The job runner is `/api/cron/tick`. Something must call it every 15 minutes (step 7).

## Run it on your laptop

Needs Node 20 or newer.

```bash
cp .env.example .env.local
```

Fill in `STUDIO_SECRET`, `CRON_SECRET` and `APP_URL=http://localhost:3100`.
Leave the database and storage lines empty: locally the studio uses `./data`. Without the Google keys,
the sign-in page shows **Enter studio (local only)**; the deployed studio always asks for Google.

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

### 1. Database: Supabase

1. Sign up at supabase.com (free plan, no card) → **New project**. Pick a region near you, e.g. Mumbai
   or Singapore, and save the database password it asks for.
2. Open the project → **Connect** (top bar) → **Connection string** → **Transaction pooler**
   (port `6543`). Copy it, put your database password in place of `[YOUR-PASSWORD]`, and set it as
   `SUPABASE_DATABASE_URL`.

Use the transaction pooler, not the direct connection: Vercel opens many short connections and the
pooler handles them. The tables are created on first use. Free Supabase projects pause after a week
with no activity; the job runner calling the studio every 15 minutes keeps it awake.

### 2. Video storage: Cloudinary

1. Sign up at cloudinary.com (free plan, no card needed).
2. Dashboard → **API Keys** (or *Settings → API Keys*) → copy the **API environment variable**
   (`cloudinary://<api_key>:<api_secret>@<cloud_name>`) into `CLOUDINARY_URL`.

The free plan takes **videos up to 100 MB** and gives 25 credits a month (1 credit = 1 GB stored or
1 GB downloaded). Export long cartoons at 720p, or a lower bitrate, to stay under 100 MB. Files are
stored under random names and deleted the day after they are live everywhere.


### 3. Claude (your Claude account, no API key)

Claude writes the SEO through **Claude Code** on your laptop, signed in with your Claude account
(Pro or Max), so its use counts toward your plan and there is no API key or bill.

1. Install Claude Code and run `claude` once to sign in with your Claude account.
2. In this folder's `.env.local`, set `HELPER_STUDIO_URL` to your deployed studio address and
   `HELPER_SECRET` to its `CRON_SECRET`.
3. Start the helper and leave the window open:

```bash
npm run claude-helper
```

It checks for new videos every minute. The **Accounts** page shows whether it is running. While it is
off, videos still post on time with the basic SEO draft.

### 4. Google: sign-in and YouTube

1. console.cloud.google.com → new project → enable **YouTube Data API v3**.
2. **OAuth consent screen**: External. Add your Google account as a test user.
3. **Credentials → Create OAuth client ID** → *Web application*. Add both redirect URIs:
   - `https://YOUR-APP.vercel.app/api/auth/google/callback` (signing in to the studio)
   - `https://YOUR-APP.vercel.app/api/oauth/google/callback` (connecting YouTube)
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and put your Gmail address in `OWNER_EMAILS`.
   Only the accounts listed there can sign in.
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
- Cloudinary's free plan: videos up to 100 MB each, 25 credits a month. With next-day cleanup, a week of
  cartoons booked ahead fits easily.
- Claude rewrites the SEO only while the helper runs on your laptop. A video that starts posting first
  keeps the basic draft.
- If you remove a video after it was uploaded early, delete it on YouTube or Facebook too.
