-- League Pro: every league/tournament player needs a Scribble account.
-- Commissioners invite players by email; the spot links to the player's
-- account when they sign in with that email (or join with the code).
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.

alter table public.league_members add column if not exists invite_email text;
create index if not exists league_members_invite_idx on public.league_members (lower(invite_email));

-- Invite emails are private to commissioners: members can read every other
-- column, but not invite_email (commissioners use league_invites()).
revoke select on public.league_members from authenticated;
grant select (id, league_id, user_id, name, ghin_number, handicap_index, team, role, created_at)
  on public.league_members to authenticated;

create or replace function public.league_invites(p_league uuid)
returns table (member_id uuid, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_league_admin(p_league) then raise exception 'Only the commissioner can see invites'; end if;
  return query
    select m.id, m.invite_email from league_members m
    where m.league_id = p_league and m.invite_email is not null and m.user_id is null;
end;
$$;
revoke all on function public.league_invites(uuid) from public, anon;
grant execute on function public.league_invites(uuid) to authenticated;

-- Link any spots I was invited to (called by the app after sign-in).
create or replace function public.claim_my_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  n integer;
begin
  if auth.uid() is null or v_email = '' then return 0; end if;
  update league_members m
    set user_id = auth.uid(), invite_email = null
    where lower(m.invite_email) = v_email
      and m.user_id is null
      and not exists (select 1 from league_members x where x.league_id = m.league_id and x.user_id = auth.uid());
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.claim_my_invites() from public, anon;
grant execute on function public.claim_my_invites() to authenticated;

-- Join with a code: take the spot invited to my email, else a name-only spot
-- with my name, else a new spot.
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

-- Scores only for players who have joined with an account.
create or replace function public.can_score(p_event uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members t where t.id = p_member and t.user_id is not null)
  and exists (
    select 1
    from league_events e
    join league_members me on me.league_id = e.league_id and me.user_id = auth.uid()
    where e.id = p_event
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
