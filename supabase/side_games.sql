-- Side games (bets) for league and tournament rounds: skins, Stableford and
-- stroke play across the field. Paste into Supabase: SQL Editor -> New query
-- -> Run. Safe to run again.
--
-- side_games: { skins: {...}, stableford: {...}, stroke: {...}, players: [memberId] | null }
-- (see src/lib/league/sideGames.js). Only commissioners can change it:
-- league_events updates are already commissioner-only. The app only tracks
-- and settles; it never holds or moves money.

alter table public.league_events add column if not exists side_games jsonb;
