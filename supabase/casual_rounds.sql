-- Shared casual rounds: a round created on one phone shows up on every
-- player's phone, and each foursome keeps its own score from its own phone.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
--
-- casual_rounds         the round's setup (course, tee, players, games, foursomes)
-- casual_round_players  who is in it: one row per player, with their foursome (grp)
-- casual_entries        everything that changes during play, one row per key:
--                         s:<playerId>:<hole>   a score (null = cleared)
--                         w:<gameId>:<hole>     Wolf pick for a hole
--                         p:<gameId>:<matchup>:<segment>:<hole>  a Nassau press
--                         status / recap / pr:<name>  final, AI recaps
--                       `at` is the phone's clock (ms) when the change was
--                       made; the newest change wins, an older one arriving
--                       late (it sat in a phone's offline queue) is ignored.
--
-- Rules: only the round's players can read anything. A player may write a
-- score only for players in their own foursome; side games (and so presses,
-- Wolf picks, Final and recaps) are open to everyone in the round. Only the
-- creator deletes the round for everyone; others hide it from their list.

create table if not exists public.casual_rounds (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  setup jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.casual_round_players (
  round_id text not null references public.casual_rounds(id) on delete cascade,
  player_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  grp int not null default 0,
  hidden boolean not null default false,
  primary key (round_id, player_id)
);
create index if not exists casual_round_players_user on public.casual_round_players(user_id);

create table if not exists public.casual_entries (
  round_id text not null references public.casual_rounds(id) on delete cascade,
  key text not null,
  value jsonb,
  at bigint not null,
  by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (round_id, key)
);

alter table public.casual_rounds enable row level security;
alter table public.casual_round_players enable row level security;
alter table public.casual_entries enable row level security;

-- Am I playing in this round?
create or replace function public.is_casual_player(p_round text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from casual_round_players where round_id = p_round and user_id = auth.uid());
$$;

-- May I keep score for this player? Only inside my own foursome.
create or replace function public.can_score_casual(p_round text, p_player text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from casual_round_players me
    join casual_round_players them on them.round_id = me.round_id and them.grp = me.grp
    where me.round_id = p_round and me.user_id = auth.uid() and them.player_id = p_player
  );
$$;

drop policy if exists "players read casual round" on public.casual_rounds;
create policy "players read casual round" on public.casual_rounds for select to authenticated
  using (public.is_casual_player(id));
drop policy if exists "owner deletes casual round" on public.casual_rounds;
create policy "owner deletes casual round" on public.casual_rounds for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "players read casual players" on public.casual_round_players;
create policy "players read casual players" on public.casual_round_players for select to authenticated
  using (public.is_casual_player(round_id));

drop policy if exists "players read casual entries" on public.casual_entries;
create policy "players read casual entries" on public.casual_entries for select to authenticated
  using (public.is_casual_player(round_id));
-- No insert/update policies: rounds and entries are written only through
-- the functions below, which check the rules.

-- Create (or re-send) a round. p_players: [{player_id, user_id, grp}].
-- The caller must be one of the players. Re-sending the same round is a no-op.
create or replace function public.create_casual_round(p_id text, p_setup jsonb, p_players jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  existing uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from jsonb_array_elements(p_players) x where (x->>'user_id')::uuid = auth.uid()) then
    raise exception 'You must be playing in the round';
  end if;
  select owner_id into existing from casual_rounds where id = p_id;
  if existing is not null then
    if existing <> auth.uid() then raise exception 'Round already exists'; end if;
    return;
  end if;
  insert into casual_rounds (id, owner_id, setup) values (p_id, auth.uid(), p_setup);
  insert into casual_round_players (round_id, player_id, user_id, grp)
    select p_id, x->>'player_id', (x->>'user_id')::uuid, coalesce((x->>'grp')::int, 0)
    from jsonb_array_elements(p_players) x
    on conflict do nothing;
end $$;

-- Send changes: [{key, value, at}]. The newest `at` wins per key. Scores for
-- players outside my foursome, and anything from non-players, are skipped.
-- Returns how many were stored.
create or replace function public.put_casual_entries(p_round text, p_entries jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  k text;
  n int := 0;
begin
  if not public.is_casual_player(p_round) then raise exception 'You are not in this round'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    k := e->>'key';
    if k is null or length(k) > 200 then continue; end if;
    if k like 's:%' and not public.can_score_casual(p_round, split_part(k, ':', 2)) then continue; end if;
    insert into casual_entries (round_id, key, value, at, by, updated_at)
      values (p_round, k, case when e->'value' = 'null'::jsonb then null else e->'value' end, (e->>'at')::bigint, auth.uid(), now())
      on conflict (round_id, key) do update
        set value = excluded.value, at = excluded.at, by = excluded.by, updated_at = now()
        where casual_entries.at < excluded.at;
    n := n + 1;
  end loop;
  update casual_rounds set updated_at = now() where id = p_round;
  return n;
end $$;

-- Take a round off my list (it stays for the other players).
create or replace function public.hide_casual_round(p_round text) returns void
language sql security definer set search_path = public as $$
  update casual_round_players set hidden = true where round_id = p_round and user_id = auth.uid();
$$;

revoke all on function public.is_casual_player(text) from public, anon;
revoke all on function public.can_score_casual(text, text) from public, anon;
revoke all on function public.create_casual_round(text, jsonb, jsonb) from public, anon;
revoke all on function public.put_casual_entries(text, jsonb) from public, anon;
revoke all on function public.hide_casual_round(text) from public, anon;
grant execute on function public.is_casual_player(text) to authenticated;
grant execute on function public.can_score_casual(text, text) to authenticated;
grant execute on function public.create_casual_round(text, jsonb, jsonb) to authenticated;
grant execute on function public.put_casual_entries(text, jsonb) to authenticated;
grant execute on function public.hide_casual_round(text) to authenticated;
