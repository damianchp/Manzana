# My Tasks

A single-file personal task manager (List / Board / Calendar / Sync) with subtasks,
real Google Calendar sync, and Google Drive cross-device sync — deployable for
free on GitHub Pages.

## Deploy (one time)

1. Create a new **public** GitHub repo (Pages' free tier requires public for
   personal accounts), e.g. `my-tasks`.
2. Put these five files at the repo root: `index.html`, `manifest.json`, `sw.js`,
   `icon-192.png`, `icon-512.png`, `.nojekyll`.
3. Settings → Pages → Source: **Deploy from a branch** → Branch: `main` / `(root)` → Save.
4. Wait ~1 minute, then your app is live at:
   `https://<your-username>.github.io/<repo-name>/`

No build step, no GitHub Actions required — Pages serves the static files directly.

## Connect your Google account

1. In the same URL from step 4 above, open the **Sync** tab.
2. Go to the [Google Cloud Console](https://console.cloud.google.com/) → create
   a project → **APIs & Services → Library** → enable **Google Calendar API**
   and **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → User type **External** → fill
   the minimum fields → **Publishing status: Testing** → add your own Google
   account under **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   Application type **Web application** → under **Authorized JavaScript
   origins** add exactly:
   `https://<your-username>.github.io`
   (scheme + host only — no path, no trailing slash).
5. Copy the generated Client ID and paste it into the app's Sync tab → **Cloud
   account** card. Click **Connect Google account**.

Because the app runs entirely client-side, this Client ID is safe to have
in the public repo — it's a public identifier, not a secret. No server,
database, or API key ever needs to be hidden.

## Updating the app later

Edit `index.html`, commit, push to `main`. Pages redeploys automatically in
under a minute. If you don't see changes on your phone, the installed PWA may
be serving a cached copy — pull-to-refresh or fully close/reopen the app once.

## Known limits of the free setup

- **OAuth "Testing" mode**: Google shows an "unverified app" warning on first
  connect (click through it — it's expected for a personal project) and
  access grants can expire after inactivity, requiring you to reconnect.
  Full "Production" verification needs a privacy policy + domain ownership
  proof and isn't worth it for a single-user app.
- **Drive sync is last-write-wins**, not a merge — fine for one person on two
  devices, not for simultaneous multi-user editing.
- **Public repo**: your task titles/notes aren't secret from anyone who finds
  the repo, but no one can *use* the app as you unless they have your Google
  login — the data itself lives in your Drive/Calendar, not in the repo.


## Booking backend (Supabase)

The scheduling/booking feature needs a shared database so visitors can't
double-book. See `SUPABASE_SETUP.md` for the ~10-minute free setup: create a
Supabase project, run the provided SQL, and paste two public keys into the
app's Sync tab. Without it, bookings save only locally (fine for personal
testing).
