# Scheduled booking sync via GitHub Actions — setup (~15 min, free)

This makes bookings land on your Google Calendar automatically at ~07:00,
12:00 and 15:00 (Copenhagen time) **even when no device has Manzana open**.
It complements the in-app sync (which runs on every app open and at the same
hours while the app is open).

## How it works
A scheduled GitHub Actions workflow runs `scripts/sync-bookings.mjs`, which:
1. reads confirmed bookings without a calendar event from Supabase (using
   your host key),
2. creates the events on your calendar using a **Google service account** —
   a robot identity whose key never expires (unlike browser OAuth), and
3. writes each event id back to Supabase so neither the app nor the script
   ever creates duplicates.

All credentials live in **GitHub Actions Secrets** — encrypted, invisible in
the public repo, never printed in logs.

## Step 1 — Create the service account (Google Cloud Console)
1. Open https://console.cloud.google.com → select the SAME project you use
   for the OAuth Client ID.
2. **IAM & Admin → Service Accounts → Create service account.**
   Name: `manzana-sync` (anything works). No roles needed — skip those steps.
3. Open the created account → **Keys → Add key → Create new key → JSON.**
   A `.json` file downloads. Treat it like a password.
4. Note the service account's **email** (looks like
   `manzana-sync@yourproject.iam.gserviceaccount.com`).

## Step 2 — Share your calendar with the robot
1. Google Calendar (web) → gear → Settings → your calendar → **Share with
   specific people or groups → Add people.**
2. Paste the service account email. Permission: **Make changes to events.**

This is the entire authorization — no OAuth, nothing to expire.

## Step 3 — Add the repo secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret.**
Create these five:

| Secret name | Value |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | the anon public key |
| `SUPABASE_HOST_KEY` | your host key passphrase |
| `GOOGLE_SA_KEY_JSON` | the **entire contents** of the downloaded JSON file, pasted as-is |
| `GOOGLE_CALENDAR_ID` | your Gmail address (for your primary calendar) |

## Step 4 — Add the files & test
1. Commit `scripts/sync-bookings.mjs` and
   `.github/workflows/sync-bookings.yml` to the repo (keep the folder paths).
2. Repo → **Actions** tab → "Sync bookings to Google Calendar" →
   **Run workflow** (manual trigger) → watch the log. You should see
   `Found N unsynced booking(s)` and per-booking `Synced:` lines.

After that it runs on its own schedule.

## Honest limitations
- **GitHub cron is imprecise**: runs can be 5–30+ minutes late and are
  occasionally skipped at busy times. Fine for this purpose.
- **60-day inactivity pause**: GitHub disables scheduled workflows in repos
  with no commits for 60 days; you get an email and re-enable with one
  click. Any commit resets the clock.
- **No invitee on the event**: service accounts can't add guests to events
  without Google Workspace domain delegation, so the script omits attendees.
  The invitee already received their own "Add to Google Calendar" button at
  booking time, so they have it on their side.
- Events created by the robot show the service account as creator — cosmetic
  only; they're on your calendar and fully editable by you.
