# Booking backend setup (Supabase) — ~10 minutes, free

This gives your public booking links a shared database so different visitors
can't double-book, and so bookings actually reach you. Only bookings + your
scheduling config live here; tasks/notes stay in your browser + Drive.

## 1. Create the project
1. Go to https://supabase.com → sign up (free) → **New project**.
2. Pick any name, a strong database password (you won't need it again for
   this), and the region closest to you (e.g. Frankfurt/EU for Copenhagen).
3. Wait ~2 minutes for it to provision.

## 2. Run the setup SQL
Open **SQL Editor** (left sidebar) → **New query** → paste everything in the
block below → **Run**. It creates two tables and the security rules.

```sql
-- ============================================================
-- SECURITY MODEL
--   Public visitors (anon key, which IS public in your repo) can only:
--     1. read busy times WITHOUT invitee names/emails (a view)
--     2. insert a new booking
--     3. read your schedule config (event types + availability)
--   Everything privileged (read full bookings incl. PII, cancel/update,
--   rewrite your config) requires a secret x-host-key header that only
--   YOUR browser sends. The secret lives in the app's Sync tab — never
--   in the repo.
-- ============================================================

-- One-time: store your host secret in the database (change the value!).
-- Pick a long random passphrase and use the SAME value in the app's
-- "Host key" field. To rotate it later, just run this line again.
create table if not exists public.app_secrets (
  name text primary key,
  value text not null
);
insert into public.app_secrets (name, value)
  values ('host_key', 'CHANGE-ME-to-a-long-random-passphrase')
  on conflict (name) do update set value = excluded.value;

alter table public.app_secrets enable row level security;
-- (no policies = nobody can read it via the API; only SQL/policies can)

-- Helper: does this request carry the correct host key header?
create or replace function public.is_host()
returns boolean language sql stable security definer as $$
  select coalesce(
    (current_setting('request.headers', true)::json ->> 'x-host-key'),
    ''
  ) = (select value from public.app_secrets where name = 'host_key');
$$;

-- ============================================================
-- BOOKINGS
-- ============================================================
create table if not exists public.bookings (
  id text primary key,
  event_type_id   text not null,
  event_type_name text,
  date            date not null,
  start_time      time not null,
  end_time        time not null,
  invitee_name    text not null,
  invitee_email   text not null,
  note            text default '',
  status          text not null default 'confirmed',
  gcal_event_id   text,
  created_at      timestamptz not null default now()
);

create unique index if not exists bookings_no_double
  on public.bookings (event_type_id, date, start_time)
  where status = 'confirmed';

alter table public.bookings enable row level security;

-- Clean slate if you ran the earlier (looser) version of this setup:
drop policy if exists "anon can insert bookings" on public.bookings;
drop policy if exists "anon can read bookings"   on public.bookings;
drop policy if exists "anon can update bookings" on public.bookings;

-- Public: may only CREATE bookings.
create policy "public can insert bookings"
  on public.bookings for insert
  to anon with check (true);

-- Host only: full read (incl. invitee PII).
create policy "host can read bookings"
  on public.bookings for select
  to anon using ( public.is_host() );

-- Host only: update (cancel, mark synced to calendar).
create policy "host can update bookings"
  on public.bookings for update
  to anon using ( public.is_host() ) with check ( public.is_host() );

-- Public busy view: time ranges only — NO names, NO emails, NO notes.
-- security_invoker=false (default) lets it bypass the table RLS safely,
-- exposing only these columns.
create or replace view public.bookings_busy
  with (security_invoker = false) as
  select date, start_time, end_time
  from public.bookings
  where status = 'confirmed';

grant select on public.bookings_busy to anon;

-- ============================================================
-- SCHEDULE_CONFIG (event types + availability)
-- ============================================================
create table if not exists public.schedule_config (
  id            int primary key default 1,
  event_types   jsonb not null default '[]',
  availability  jsonb not null default '{}',
  updated_at    timestamptz not null default now(),
  constraint single_row check (id = 1)
);

alter table public.schedule_config enable row level security;

drop policy if exists "anon can read config"   on public.schedule_config;
drop policy if exists "anon can upsert config" on public.schedule_config;
drop policy if exists "anon can update config" on public.schedule_config;

-- Public: read-only (booking pages need it).
create policy "public can read config"
  on public.schedule_config for select
  to anon using (true);

-- Host only: write.
create policy "host can insert config"
  on public.schedule_config for insert
  to anon with check ( public.is_host() );
create policy "host can update config"
  on public.schedule_config for update
  to anon using ( public.is_host() ) with check ( public.is_host() );
```

## 3. Get your keys
Left sidebar → **Project Settings** (gear) → **API**. Copy:
- **Project URL** — looks like `https://abcdxyz.supabase.co`
- **anon public** key — a long `eyJ...` string

Both are safe to expose publicly; the Row Level Security rules above are what
actually protect the data. (Never use the `service_role` key in the browser.)

## 4. Connect the app
In your live app → **Sync** tab → **Booking backend** card:
1. Paste the Project URL and anon key.
2. In **Host key**, enter the exact same passphrase you put in the SQL
   (`CHANGE-ME-...` line — you did change it, right?). This is your private
   admin secret: it's what lets YOUR browser read invitee details, cancel
   bookings, and update your availability, while the public can't.
3. Click **Test connection** — it should say "Connection works".
4. This also publishes your current event types + availability to the backend.

**Never put the host key anywhere in the GitHub repo.** It lives only in the
app's Sync tab (your browser + your private Drive backup). The anon key and
project URL are fine to commit — that's the whole point of the security rules.

## 5. Make the public link work for strangers (important)
A stranger's browser starts empty, so the deployed file needs your Supabase
creds baked in for the *public* booking page to load. In `index.html`, find:

```js
const BUILD_SUPABASE = { url:'', anonKey:'' };
```

Fill in the same two values, commit, and push. Now
`https://damianchp.github.io/Manzana/#book/intro-call` works for anyone.

(Your own dashboard doesn't need this — it reads the creds you saved in the
Sync tab. BUILD_SUPABASE only bootstraps *visitors'* browsers.)

## How bookings reach your Google Calendar
Per your setup: bookings are written to Supabase by whoever books. When **you**
open the **Meetings** tab (while connected to Google), the app pulls new
bookings and creates the matching timed Google Calendar events, writing the
event id back so they're never duplicated. So: open Meetings periodically (or
before your day) to pull everything onto your calendar.

## What the public can and cannot do (with your committed anon key)
CAN: see which time ranges are busy (no names/emails), read your event types
and weekly availability, create a booking.
CANNOT: read who booked or their emails/notes, cancel or modify any booking,
change your availability or event types. All of those require the host key,
which is never in the repo.

## Free-tier note
A free Supabase project pauses after ~7 days of zero activity and takes a few
seconds to wake on the next request. Fine for personal scheduling; just expect
an occasional first-request delay.
