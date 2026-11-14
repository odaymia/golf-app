-- Regular vs major rounds (majors pay more season points).
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
alter table public.league_events
  add column if not exists tier text not null default 'regular' check (tier in ('regular', 'major'));
