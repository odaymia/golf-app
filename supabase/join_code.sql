-- One Join button for everyone with the code. Entering a code gives you your
-- spot if the commissioner reserved one for you (your email, your name, or
-- they added your Scribble account); otherwise you join as a spectator who
-- sees everything but can't enter scores. The commissioner can move a
-- spectator into the field (Players -> Not playing -> Add as player).
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs watchers.sql.

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
  -- Already in it (player, organizer or spectator): nothing changes.
  if exists (select 1 from league_members where league_id = v_league and user_id = auth.uid()) then
    return v_league;
  end if;
  -- A spot reserved for me: by my email first, then by my name.
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
    -- No spot for me: follow along as a spectator.
    insert into league_members (league_id, user_id, name, handicap_index, ghin_number, role, plays)
      values (v_league, auth.uid(), coalesce(nullif(trim(p_member_name), ''), 'Spectator'), p_index, p_ghin, 'viewer', false);
  end if;
  return v_league;
end;
$$;
