-- Foursome side games in league/tournament rounds: each group's own casual
-- games (skins, match play, Nassau, Wolf, Vegas, stroke, Stableford) on any
-- stretch of holes, played off the round's scores (src/lib/league/foursomeGames.js).
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs leagues.sql and watchers.sql.

create table if not exists public.group_side_games (
  event_id uuid not null references public.league_events (id) on delete cascade,
  group_key text not null check (length(group_key) <= 500), -- sorted member ids, comma-joined
  sets jsonb not null default '[]'::jsonb,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (event_id, group_key)
);
alter table public.group_side_games enable row level security;

-- Who may change a group's side games: a player in that group, or a
-- commissioner. Viewers never.
create or replace function public.can_edit_group_games(p_event uuid, p_group text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from league_events e
    join league_members me on me.league_id = e.league_id and me.user_id = auth.uid()
    where e.id = p_event
      and me.role <> 'viewer'
      and (me.role = 'commissioner' or me.id::text = any (string_to_array(p_group, ',')))
  );
$$;
revoke all on function public.can_edit_group_games(uuid, text) from public, anon;
grant execute on function public.can_edit_group_games(uuid, text) to authenticated;

drop policy if exists "members read group games" on public.group_side_games;
drop policy if exists "group writes group games" on public.group_side_games;
drop policy if exists "group updates group games" on public.group_side_games;
drop policy if exists "group deletes group games" on public.group_side_games;
create policy "members read group games" on public.group_side_games for select to authenticated
  using (exists (select 1 from league_events e where e.id = event_id and public.is_league_member(e.league_id)));
create policy "group writes group games" on public.group_side_games for insert to authenticated
  with check (public.can_edit_group_games(event_id, group_key));
create policy "group updates group games" on public.group_side_games for update to authenticated
  using (public.can_edit_group_games(event_id, group_key)) with check (public.can_edit_group_games(event_id, group_key));
create policy "group deletes group games" on public.group_side_games for delete to authenticated
  using (public.can_edit_group_games(event_id, group_key));
grant select, insert, update, delete on public.group_side_games to authenticated;

create or replace function public.touch_group_side_games() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists group_side_games_touch on public.group_side_games;
create trigger group_side_games_touch before insert or update on public.group_side_games
  for each row execute function public.touch_group_side_games();
