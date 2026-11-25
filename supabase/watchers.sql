-- Organizers who don't play, and spectators who watch with the code.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs leagues.sql, league_pro.sql (and groups.sql).
--
-- league_members.plays = false: in the league but not a player (no card,
-- not in standings, groups or matches). role 'viewer': watches only; can
-- read everything members can, can't score or change anything.

alter table public.league_members add column if not exists plays boolean not null default true;
-- Members may read it (league_pro.sql only allows reading listed columns).
grant select (plays) on public.league_members to authenticated;

alter table public.league_members drop constraint if exists league_members_role_check;
alter table public.league_members add constraint league_members_role_check
  check (role in ('commissioner', 'member', 'viewer'));

-- Watch a league/tournament with its code (read only).
create or replace function public.watch_league(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_league uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into v_league from leagues where invite_code = upper(trim(p_code));
  if v_league is null then raise exception 'No league with that code'; end if;
  if not exists (select 1 from league_members where league_id = v_league and user_id = auth.uid()) then
    insert into league_members (league_id, user_id, name, role, plays)
    values (v_league, auth.uid(), coalesce(nullif(trim(p_name), ''), 'Spectator'), 'viewer', false);
  end if;
  return v_league;
end;
$$;
revoke all on function public.watch_league(text, text) from public, anon;
grant execute on function public.watch_league(text, text) to authenticated;

-- Stop watching (a viewer leaves; players and commissioners aren't touched).
create or replace function public.stop_watching(p_league uuid) returns void
language sql security definer set search_path = public as $$
  delete from league_members where league_id = p_league and user_id = auth.uid() and role = 'viewer';
$$;
revoke all on function public.stop_watching(uuid) from public, anon;
grant execute on function public.stop_watching(uuid) to authenticated;

-- A watcher who later joins with the code as a player becomes a player.
create or replace function public.join_league(p_code text, p_member_name text, p_index numeric, p_ghin text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_league uuid;
  v_member uuid;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into v_league from leagues where invite_code = upper(trim(p_code));
  if v_league is null then raise exception 'No league with that code'; end if;
  if exists (select 1 from league_members where league_id = v_league and user_id = auth.uid() and role = 'viewer') then
    update league_members
      set role = 'member', plays = true,
          name = coalesce(nullif(trim(p_member_name), ''), name),
          handicap_index = coalesce(handicap_index, p_index),
          ghin_number = coalesce(ghin_number, p_ghin)
      where league_id = v_league and user_id = auth.uid() and role = 'viewer';
    return v_league;
  end if;
  if exists (select 1 from league_members where league_id = v_league and user_id = auth.uid()) then
    return v_league;
  end if;
  select id into v_member from league_members
    where league_id = v_league and user_id is null and v_email <> '' and lower(invite_email) = v_email
    order by created_at limit 1;
  if v_member is null then
    select id into v_member from league_members
      where league_id = v_league and user_id is null and invite_email is null
        and lower(trim(name)) = lower(trim(p_member_name))
      order by created_at limit 1;
  end if;
  if v_member is not null then
    update league_members
      set user_id = auth.uid(),
          invite_email = null,
          handicap_index = coalesce(handicap_index, p_index),
          ghin_number = coalesce(ghin_number, p_ghin)
      where id = v_member;
  else
    insert into league_members (league_id, user_id, name, handicap_index, ghin_number)
      values (v_league, auth.uid(), coalesce(nullif(trim(p_member_name), ''), 'Player'), p_index, p_ghin);
  end if;
  return v_league;
end;
$$;

-- Scores: never by a viewer, never for someone who isn't playing.
create or replace function public.can_score(p_event uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members t where t.id = p_member and t.user_id is not null and t.plays)
  and exists (
    select 1
    from league_events e
    join league_members me on me.league_id = e.league_id and me.user_id = auth.uid()
    where e.id = p_event
      and me.role <> 'viewer'
      and (
        me.role = 'commissioner'
        or me.id = p_member
        or exists (
          select 1 from jsonb_array_elements(e.groups) g
          where g ? me.id::text and g ? p_member::text
        )
        or (
          not exists (select 1 from jsonb_array_elements(e.groups) g where g ? me.id::text)
          and exists (
            select 1 from jsonb_array_elements(e.matchups) mu
            where ((mu -> 'sides' -> 0) ? me.id::text or (mu -> 'sides' -> 1) ? me.id::text)
              and ((mu -> 'sides' -> 0) ? p_member::text or (mu -> 'sides' -> 1) ? p_member::text)
          )
        )
      )
  );
$$;
