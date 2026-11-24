# Reach Studio

Add a finished cartoon. The studio writes the SEO with Claude, books the next free daily slot, and posts
the video to YouTube, Facebook, Instagram and TikTok at that time. Posting works with your laptop off;
Claude researches the market and writes the SEO through your own Claude account while the helper runs on
your laptop.

You sign in with an email and password, handled by Supabase Auth. The first time, the sign-in page asks
you to create the account; no password goes in the settings files.

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
2. The studio writes a basic SEO draft at once, so the video never waits, and starts the **Claude helper**
   on GitHub Actions (or on your laptop with `npm run claude-helper`). The helper looks at the whole video:
   a frame every few seconds from start to end, what is said in it (speech to text with Whisper), and what
   people type into YouTube search for related phrases. Claude Code, signed in with your Claude account,
   reads all of that and researches the market on the web: what parents and kids search right now, the titles and tags of the top channels in your niche, trending hashtags on Shorts, TikTok and
   Reels, and festivals coming up. Then it writes Urdu + English text for each platform (a few minutes).
   Its findings show on the video page under **Market research by Claude**. It replaces the draft if posting has not started.
   Your own edits to the text cancel a waiting rewrite.
3. The video takes the next free daily slot (Pakistan time), or keeps the time you picked.
4. 6 hours before the slot, YouTube and Facebook get the video, scheduled to go public at the slot.
   1 hour before, Instagram gets the Reel to process. At the slot, Instagram publishes and TikTok posts
   through Upload-Post. A failed post retries 3 times, then shows on Today.
5. The day after a video is live on every chosen platform, its video file is deleted. Its SEO, links and
   thumbnail stay.

The job runner is `/api/cron/tick`. Something must call it every 15 minutes (step 8).

## Run it on your laptop

Needs Node 20 or newer.

```bash
cp .env.example .env.local
```

Fill in `STUDIO_SECRET`, `CRON_SECRET` and `APP_URL=http://localhost:3100`.
Sign-in needs a Supabase project, even on your laptop: set up the database and sign-in in steps 1 and 2
below, and put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_DATABASE_URL` in `.env.local`. Leave the storage line empty: locally the studio keeps video files
in `./data`. Open the studio and create your account on the sign-in page (on your laptop it does not ask
for the setup code).

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

The browser tests run against a small local Supabase Auth, not your real project. Start it (needs Docker):

```bash
docker compose -f e2e/supabase/compose.yml up -d
```

Start the studio with the test settings:

```bash
set -a; . e2e/supabase/test.env; set +a; npx next dev -p 3100
```

In another window, run Playwright with the same settings:

```bash
set -a; . e2e/supabase/test.env; set +a; npx playwright test
```

The test emails show at http://localhost:54324 (Mailpit).

## Deploy on Vercel (free Hobby plan)

Vercel's Hobby plan is for personal, non-commercial use. When the channel earns money, move to Pro.

### 1. Database: Supabase

1. Sign up at supabase.com (free plan, no card) → **New project**. Pick a region near you, e.g. Mumbai
   or Singapore, and save the database password it asks for.
2. Open the project → **Connect** (top bar) → **Connection string** → **Transaction pooler**
   (port `6543`). Copy it, put your database password in place of `[YOUR-PASSWORD]`, and set it as
   `SUPABASE_DATABASE_URL`.

Use the transaction pooler, not the direct connection: Vercel opens many short connections and the
pooler handles them. The tables are created on first use. The studio also reads and updates Supabase's own
`auth.users` table through this connection: that is where it marks which account owns the studio (the
`studio_owner` flag). Free Supabase projects pause after a week with no activity; the job runner calling
the studio every 15 minutes keeps it awake.

### 2. Sign-in: Supabase Auth

Sign-in uses the same Supabase project.

1. Open the project → **Connect**. Copy the project URL (`https://<ref>.supabase.co`) into
   `NEXT_PUBLIC_SUPABASE_URL` and the **publishable key** into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   The publishable key is public, not a secret. `NEXT_PUBLIC_` values are built into the app, so after
   you add or change them on Vercel, **redeploy**.
2. **Authentication → URL Configuration**: set **Site URL** to your Vercel address, e.g.
   `https://reach-studio-five.vercel.app`. Under **Redirect URLs** add
   `https://reach-studio-five.vercel.app/**` and `http://localhost:3000/**` (use your own address if it
   differs). Without this, email links open the Site URL (by default `http://localhost:3000`) instead
   of the studio.
3. Emails: Supabase's built-in email only sends to members of your Supabase team, and it has a low limit
   per hour. To email any address, add your own SMTP under **Authentication → Emails → SMTP**, for
   example Resend.
4. Email design: **Authentication → Emails → Templates**. Paste `supabase/templates/confirm-signup.html`
   into **Confirm signup** and `supabase/templates/reset-password.html` into **Reset password**; the
   subject line is in a comment at the top of each file. Their links use a token, so they work in any
   browser, not only the one that asked for the email.
5. Optional: after you create your account, turn off **Allow new users to sign up**
   (*Authentication → Sign In / Providers*). The studio already refuses any account that is not the owner.

`STUDIO_SECRET` only encrypts the platform tokens now; it is not used for sign-in. `CRON_SECRET` is still
the **setup code** for creating the first account in production.

If you used an older version of the studio that kept its own `users` table, that table is no longer used.
You can drop it.

### 3. Video storage: Cloudinary

1. Sign up at cloudinary.com (free plan, no card needed).
2. Dashboard → **API Keys** (or *Settings → API Keys*) → copy the **API environment variable**
   (`cloudinary://<api_key>:<api_secret>@<cloud_name>`) into `CLOUDINARY_URL`.

The free plan takes **videos up to 100 MB** and gives 25 credits a month (1 credit = 1 GB stored or
1 GB downloaded). Export long cartoons at 720p, or a lower bitrate, to stay under 100 MB. Files are
stored under random names and deleted the day after they are live everywhere.


### 4. Claude (your Claude account, no API key)

Claude writes the SEO through **Claude Code**, signed in with your Claude account (Pro or Max), so its
use counts toward your plan and there is no API key or bill. GitHub Actions runs it every 15 minutes
(`.github/workflows/claude-seo.yml`), so no computer has to stay on.

1. On your computer, install Claude Code and make a long-lived token for it:

```bash
npm install -g @anthropic-ai/claude-code
claude setup-token
```

2. In the GitHub repository open **Settings → Secrets and variables → Actions** and add three
   repository secrets:
   - `STUDIO_URL`: your deployed studio address, e.g. `https://reach-studio-five.vercel.app`
   - `CRON_SECRET`: the same value as `CRON_SECRET` in Vercel
   - `CLAUDE_CODE_OAUTH_TOKEN`: the token from step 1
3. Open **Actions → claude-seo → Run workflow** once to check it. The **Settings** page shows
   whether Claude is running. While it is off, videos still post on time with the basic SEO draft.

The same `STUDIO_URL` and `CRON_SECRET` secrets also let the `tick` workflow call the job runner every
15 minutes, so cron-job.org is optional.

On a laptop instead: set `HELPER_STUDIO_URL` and `HELPER_SECRET` (the Vercel `CRON_SECRET`) in
`.env.local`, run `claude` once to sign in, and leave `npm run claude-helper` open.

### 5. YouTube

1. console.cloud.google.com → new project → enable **YouTube Data API v3**.
2. **OAuth consent screen**: External. Add your Google account as a test user.
3. **Credentials → Create OAuth client ID** → *Web application*. Add this redirect URI:
   `https://YOUR-APP.vercel.app/api/oauth/google/callback`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Apply for the **YouTube API audit** (Google's "YouTube API Services – Audit and Quota Extension"
   form). Until Google approves it, YouTube keeps API uploads private.

Cartoons are uploaded as **made for kids**, as YouTube requires. That turns comments off on them.

### 6. Facebook and Instagram

1. developers.facebook.com → **Create app** → type *Business*.
2. Add **Facebook Login for Business**. Redirect URI:
   `https://YOUR-APP.vercel.app/api/oauth/meta/callback`.
3. Your Instagram must be a **Business or Creator** account linked to your Facebook Page.
4. Set `META_APP_ID` and `META_APP_SECRET`. Set `META_CONFIG_ID` too if you made a Login configuration.

While the app is in development mode it can post to Pages you manage, which covers your own channel.

### 7. TikTok

Free: the **TikTok helper** browser extension (`extensions/tiktok-helper`, steps in **Settings → TikTok
helper**). On a video page press **Post to TikTok**: it opens TikTok's upload page in your browser, adds the
video and Claude's caption, and you press Post. TikTok only lets audited apps post publicly and does not audit
personal upload tools, so the helper never presses Post itself. Test: `node extensions/tiktok-helper/test.mjs`.

Paid alternative, fully automatic:

Sign up at upload-post.com, connect your TikTok there, and create an API key. In the studio, go to
**Accounts → TikTok** and enter the key and the profile name you gave it on Upload-Post.

### 8. Deploy and start the job runner

1. Push this folder to GitHub and import it in Vercel.
2. Add all the environment variables from `.env.example` (`APP_URL` = your Vercel address).
3. Deploy and open the app. The sign-in page asks you to **create your account**: your name, email, a
   password, and the **setup code**, which is your `CRON_SECRET`. The setup code stops a stranger from
   creating the account first. Supabase then emails a confirmation link: open it and the studio opens on
   Today. After that the page is a normal sign-in.
4. Connect the accounts on the **Accounts** page.
5. Call the job runner every 15 minutes. Free option: **cron-job.org** → new cron job →
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
- Claude rewrites the SEO when the helper runs (every 15 minutes on GitHub). A video that starts posting
  first keeps the basic draft.
- GitHub turns scheduled workflows off after 60 days with no commits to the repository. Turn them back
  on under **Actions** if that happens.
- If you remove a video after it was uploaded early, delete it on YouTube or Facebook too.
- Forgot your password? On the sign-in page press **Forgot password?**, type your email, and Supabase
  emails you a reset link. Open it in the same browser you asked from. Choose a new password; every
  device is signed out and you sign in again. You can change your password any time in **Settings**
  (it asks for the current one).
- Didn't get the confirmation email? Signing in shows **Confirm your email first** with a button to send
  it again. Supabase sends one email per address every 60 seconds; the page counts down. A confirmation
  link opened in another browser still confirms your email.
- 2-step sign-in: in **Settings** turn it on, scan the QR code with an authenticator app and type the
  6-digit code. From then on, after your password the studio asks for the code. Turn it off in the same place.
