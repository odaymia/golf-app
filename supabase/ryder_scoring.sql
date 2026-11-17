-- Ryder Cup setup and multiple scorekeepers.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs leagues.sql and groups.sql first.

-- The format chosen for a round before any matches exist (singles,
-- fourball, shamble, scramble, foursomes). Matches still carry their own.
alter table public.league_events add column if not exists match_format text;

-- Each scorekeeper's own card for a player in a round. The official card
-- stays in event_scores (latest entry wins); these let the app show when two
-- scorekeepers in a foursome disagree on a hole. Same rules as event_scores:
-- only people who may score that player (their foursome, or commissioners),
-- and members can't change a final round.
create table if not exists public.score_entries (
  event_id uuid not null references public.league_events (id) on delete cascade,
  member_id uuid not null references public.league_members (id) on delete cascade,
  scorer_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  league_id uuid not null references public.leagues (id) on delete cascade,
  gross jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id, scorer_id)
);
create index if not exists score_entries_league_idx on public.score_entries (league_id);

alter table public.score_entries enable row level security;
drop policy if exists "members read entries" on public.score_entries;
drop policy if exists "scorer adds entries" on public.score_entries;
drop policy if exists "scorer edits entries" on public.score_entries;
create policy "members read entries" on public.score_entries for select to authenticated
  using (public.is_league_member(league_id));
create policy "scorer adds entries" on public.score_entries for insert to authenticated
  with check (
    scorer_id = (select auth.uid())
    and public.can_score(event_id, member_id)
    and exists (select 1 from league_events e where e.id = event_id and e.league_id = score_entries.league_id
                and (e.status = 'scheduled' or public.is_league_admin(e.league_id)))
    and exists (select 1 from league_members m where m.id = member_id and m.league_id = score_entries.league_id)
  );
create policy "scorer edits entries" on public.score_entries for update to authenticated
  using (scorer_id = (select auth.uid()))
  with check (
    scorer_id = (select auth.uid())
    and public.can_score(event_id, member_id)
    and exists (select 1 from league_events e where e.id = event_id and e.league_id = score_entries.league_id
                and (e.status = 'scheduled' or public.is_league_admin(e.league_id)))
  );
grant select, insert, update on public.score_entries to authenticated;
