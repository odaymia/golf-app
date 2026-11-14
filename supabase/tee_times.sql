-- Tee times / shotgun starts for league and tournament rounds.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
--
-- tee_sheet: { mode: 'tee' | 'shotgun', start: 'HH:MM', interval: minutes,
--              slots: [label per group] }   (see src/lib/league/pairings.js)
-- Only commissioners can change it: league_events updates are already
-- commissioner-only.

alter table public.league_events
  add column if not exists tee_sheet jsonb;
