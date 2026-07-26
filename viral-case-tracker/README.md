# Viral Case Tracker

Finds US homicide cases that are gaining momentum but haven't been saturated
by true crime YouTube channels yet, scores them against a four-factor
framework, and tracks them on a dashboard over time.

## How it works

1. On a schedule (or when you click "Run research now"), the server calls
   the **Gemini API** with Google Search grounding enabled, asking it to
   find current US homicide cases with rising real-world attention (a
   fresh arrest, court date, viral moment, breaking local coverage, etc).
2. For each candidate, the server calls the **real YouTube Data API**
   (`search.list` + `videos.list`) to get an exact count of dedicated
   true-crime-style videos already covering that case — filtering out
   mainstream/local news uploads and clips under 4 minutes so it isn't
   counting news roundups as coverage.
3. The app scores each case itself (not either model/API) on:
   - **Momentum** — how fast interest is rising (from Gemini)
   - **Trigger freshness** — how recent/significant the news trigger is (from Gemini)
   - **YouTube saturation** — inverted score; 0 verified videos scores highest, 6+ scores zero
   - **Story strength** — narrative hooks: mystery, injustice, twist, sympathetic victim (from Gemini)
4. Cases are combined into one composite score and a verdict: **green
   light** (composite ≥ 7 and 2 or fewer verified YouTube videos), **watch**
   (composite 5–7), **skip** (below that), or **needs recheck** (the YouTube
   lookup failed — e.g. quota exceeded — so it's deliberately left unscored
   rather than guessed at).
5. Every run's results are saved to a local JSON file (`data/db.json`), so
   the dashboard shows the full running list, and re-checking the same case
   later updates its score history instead of duplicating it.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

- `GEMINI_API_KEY` — get one at https://aistudio.google.com/apikey
- `YOUTUBE_API_KEY` — get one at console.cloud.google.com: enable
  "YouTube Data API v3" on a project, then Credentials → Create
  Credentials → API Key. Restrict it to YouTube Data API v3 only.
- `RESEARCH_CRON` — how often to auto-run research, as a cron expression
  (default: `0 8 * * *`, once a day at 8am server time)
- `DASHBOARD_PASSWORD` — protects the dashboard with HTTP Basic Auth. Set
  this before hosting publicly, or anyone with the URL can see your case
  list and trigger runs.

**Quota note:** as of June 2026, YouTube caps `search.list` at 100 calls
per day, separate from the general 10,000-unit pool. Each research run
uses one search call per candidate case (typically 3–8), so running this
once or twice a day leaves plenty of headroom. Running it many times an
hour is the only way you'd realistically hit that ceiling.

Run it:

```bash
npm start
```

Open http://localhost:3000. Click **Run research now** to trigger a run
immediately instead of waiting for the schedule.

You can also trigger a one-off run from the command line without starting
the server:

```bash
npm run research-now
```

## Deploying it

This is a plain Node/Express app with no external database, so it runs
anywhere that keeps a Node process alive and gives it persistent disk:

- **Railway / Render / Fly.io** — point it at this repo, set the env vars
  above, deploy. These keep the process running continuously, so the
  built-in cron scheduler (`node-cron`) fires on its own — no extra
  configuration needed. This is the simplest option.
- **A VPS** — `npm install && npm start`, run it under `pm2` or `systemd`
  so it survives reboots.
- **Vercel** — works, but Vercel's serverless functions don't stay alive
  for a background cron job to run inside them. If you deploy there,
  remove the `startScheduler()` call in `server.js` and instead use
  [Vercel Cron](https://vercel.com/docs/cron-jobs) to hit `POST
  /api/run-now` on your chosen schedule.

**Important:** `data/db.json` is where your case history lives. On
Railway/Render/Fly, make sure you attach a persistent volume/disk to that
path — otherwise your data resets every time the app redeploys.

## Notes and honest limitations

- Gemini's search grounding is good but not perfect for finding candidate
  cases — it can occasionally miss a very fresh case or misjudge momentum.
  Treat the dashboard as a shortlist to sanity-check yourself, not a fully
  automated green light.
- The YouTube saturation count is now a real API call, but the "is this a
  dedicated true-crime video vs. a news clip" filter is still a heuristic
  (channel-name pattern matching + a 4-minute minimum length). It will
  occasionally misclassify a channel — check the actual video list shown
  on each card rather than trusting the number blind.
- If a case shows "needs recheck," the YouTube lookup failed (usually a
  quota or auth issue) — it's deliberately left unscored rather than
  guessed at. Run research again once the underlying issue is fixed.
- Each research run costs both Gemini API usage and YouTube search quota.
  Running it once or twice a day is plenty for this use case — there's no
  benefit to running it more often than new triggers actually occur.
