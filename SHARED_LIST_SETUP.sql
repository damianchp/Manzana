-- ============================================================
-- Manzana — Shared (family) to-do list backend
-- Run this once in your Supabase project's SQL Editor.
-- Uses the SAME project you already set up for bookings — no new project needed.
-- ============================================================

-- 1) The shared to-do list table itself.
create table if not exists shared_tasks (
  id text primary key,
  title text not null,
  topic text default 'General',
  priority text,
  due date,
  done boolean default false,
  added_by text default '',
  done_by text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) A tiny private table holding the shared "family key" — a passphrase
--    you and your wife both know, separate from your personal host key.
--    The anon role can NEVER read this table directly; only the
--    security-definer function below can see it.
create table if not exists shared_secrets (
  id int primary key default 1,
  family_key text not null
);
insert into shared_secrets (id, family_key)
values (1, 'change-me-please')     -- <-- CHANGE THIS before sharing the link
on conflict (id) do nothing;

-- To change the key later, run:
--   update shared_secrets set family_key = 'your-new-passphrase' where id = 1;

-- 3) RPC that checks the incoming x-family-key request header against the
--    secret. security definer lets it read shared_secrets on your behalf
--    without ever exposing that table to the anon role.
create or replace function is_family()
returns boolean
language plpgsql
security definer
as $$
begin
  return (current_setting('request.headers', true)::json ->> 'x-family-key')
         = (select family_key from shared_secrets where id = 1);
end;
$$;

-- 4) Row Level Security: anyone can read the list (so the link "just works"
--    for viewing); only requests carrying the correct family key can
--    insert, update, or delete.
alter table shared_tasks enable row level security;

drop policy if exists shared_tasks_public_read on shared_tasks;
create policy shared_tasks_public_read on shared_tasks
  for select using (true);

drop policy if exists shared_tasks_family_insert on shared_tasks;
create policy shared_tasks_family_insert on shared_tasks
  for insert with check (is_family());

drop policy if exists shared_tasks_family_update on shared_tasks;
create policy shared_tasks_family_update on shared_tasks
  for update using (is_family());

drop policy if exists shared_tasks_family_delete on shared_tasks;
create policy shared_tasks_family_delete on shared_tasks
  for delete using (is_family());

-- ============================================================
-- After running this:
-- 1. Change the family_key above to a real passphrase (or run the UPDATE
--    statement noted above right now, before anyone else has the link).
-- 2. Open the app → Shared tab → enter your name + that passphrase →
--    "Unlock editing". Give your wife the same passphrase once — she
--    enters it on her own device (it's stored locally there, not synced).
-- 3. Anyone with the app's URL can VIEW the shared list without the key;
--    only the key unlocks adding / checking off / deleting.
-- ============================================================
