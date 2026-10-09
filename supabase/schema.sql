-- Exercise Tracker database setup.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run: everything is created only if it doesn't already exist.

-- ─── Exercise days ──────────────────────────────────────────────────────────
-- One row per date per login: which muscle groups were worked, whether there
-- was a walk, and a free-text note. Replaces the "Exercises tracker" sheet.
create table if not exists public.exercise_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  legs boolean not null default false,
  arms boolean not null default false,
  chest boolean not null default false,
  core boolean not null default false,
  walk boolean not null default false,
  notes text not null default '',
  primary key (user_id, date)
);

alter table public.exercise_days enable row level security;

-- Each login can only see and change its own days. Nothing can be deleted
-- from the app; you can still do that in the dashboard.
drop policy if exists "Users can see their own days" on public.exercise_days;
create policy "Users can see their own days"
  on public.exercise_days for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can add their own days" on public.exercise_days;
create policy "Users can add their own days"
  on public.exercise_days for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can change their own days" on public.exercise_days;
create policy "Users can change their own days"
  on public.exercise_days for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Only logged-in users can use the table; guests and the public can't
revoke all on public.exercise_days from anon;
grant select, insert, update on public.exercise_days to authenticated;
