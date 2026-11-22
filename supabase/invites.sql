-- Being added to a league, tournament or round: a notification with
-- Accept / Decline (league or tournament) or I'm in / Can't make it (round).
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs leagues.sql, groups.sql, league_pro.sql, notifications.sql,
-- comment_replies.sql.

-- 1. Accepting a spot -----------------------------------------------------------
-- A spot someone else links to your account (the commissioner adding you)
-- waits for you to accept. Spots you take yourself (join code, claiming an
-- emailed invite, creating the league) are accepted straight away.
alter table public.league_members add column if not exists invite_status text not null default 'accepted';
alter table public.league_members drop constraint if exists league_members_invite_status_check;
alter table public.league_members add constraint league_members_invite_status_check
  check (invite_status in ('pending', 'accepted'));
grant select (invite_status) on public.league_members to authenticated;

create or replace function public.member_invite_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then
    new.invite_status := 'accepted';
  elsif tg_op = 'UPDATE' and old.user_id is not distinct from new.user_id then
    new.invite_status := coalesce(new.invite_status, old.invite_status);
  elsif auth.uid() is null or new.user_id = auth.uid() then
    new.invite_status := 'accepted';
  else
    new.invite_status := 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists league_members_invite_status on public.league_members;
create trigger league_members_invite_status before insert or update of user_id on public.league_members
  for each row execute function public.member_invite_status();

-- 2. Notifications for leagues and rounds ---------------------------------------
alter table public.notifications add column if not exists league_id uuid references public.leagues (id) on delete cascade;
alter table public.notifications add column if not exists event_id uuid references public.league_events (id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'reply', 'mention', 'follow', 'follow_request', 'follow_accept',
                  'message', 'review_request', 'review_answer', 'league_invite', 'round_added'));
create unique index if not exists notifications_league_once on public.notifications (user_id, league_id) where type = 'league_invite';
create unique index if not exists notifications_round_once on public.notifications (user_id, event_id) where type = 'round_added';

-- Write one notification without ever blocking the change that caused it
-- (e.g. the player has no public profile yet).
create or replace function public.notify_league(p_user uuid, p_type text, p_league uuid, p_event uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  if not exists (select 1 from public_profiles where id = p_user) then return; end if;
  v_actor := case when exists (select 1 from public_profiles where id = auth.uid()) then auth.uid() else p_user end;
  begin
    insert into notifications (user_id, actor_id, type, league_id, event_id, body)
    values (p_user, v_actor, p_type, p_league, p_event, left(coalesce(p_body, ''), 140))
    on conflict do nothing;
  exception when others then
    null;
  end;
end;
$$;
revoke all on function public.notify_league(uuid, text, uuid, uuid, text) from public, anon, authenticated;

-- Added to a league or tournament (spot linked to your account by someone else).
create or replace function public.notify_member_added() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and new.invite_status = 'pending'
     and (tg_op = 'INSERT' or old.user_id is distinct from new.user_id) then
    perform notify_league(new.user_id, 'league_invite', new.league_id, null,
      (select name from leagues where id = new.league_id));
  end if;
  return new;
end;
$$;
drop trigger if exists league_members_notify on public.league_members;
create trigger league_members_notify after insert or update of user_id on public.league_members
  for each row execute function public.notify_member_added();

-- Put in a round's group (foursome) by someone else.
create or replace function public.notify_round_groups() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new uuid[];
  v_old uuid[];
  v_member record;
begin
  if new.status = 'final' then return new; end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into v_new
    from jsonb_array_elements(coalesce(new.groups, '[]'::jsonb)) g, jsonb_array_elements_text(g) x;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(distinct x::uuid), '{}') into v_old
      from jsonb_array_elements(coalesce(old.groups, '[]'::jsonb)) g, jsonb_array_elements_text(g) x;
  else
    v_old := '{}';
  end if;
  for v_member in
    select m.user_id from league_members m
    where m.id = any (v_new) and not (m.id = any (v_old)) and m.user_id is not null
  loop
    perform notify_league(v_member.user_id, 'round_added', new.league_id, new.id, new.name);
  end loop;
  return new;
end;
$$;
drop trigger if exists league_events_groups_notify on public.league_events;
create trigger league_events_groups_notify after insert or update of groups on public.league_events
  for each row execute function public.notify_round_groups();

-- 3. Answers ---------------------------------------------------------------------
-- Who said they're in or out for a round: { memberId: true | false }.
alter table public.league_events add column if not exists rsvp jsonb not null default '{}'::jsonb;

-- Accept or decline a league/tournament spot. Declining gives the spot up
-- (a commissioner can't decline their own league).
create or replace function public.respond_league_invite(p_league uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_accept then
    update league_members set invite_status = 'accepted' where league_id = p_league and user_id = auth.uid();
  else
    delete from league_members where league_id = p_league and user_id = auth.uid() and role <> 'commissioner';
  end if;
  update notifications set read_at = now()
    where user_id = auth.uid() and type = 'league_invite' and league_id = p_league;
end;
$$;
revoke all on function public.respond_league_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_league_invite(uuid, boolean) to authenticated;

-- I'm in / can't make it for a round. Saying you're in also accepts the
-- league spot if it was still waiting.
create or replace function public.respond_round(p_event uuid, p_in boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_league uuid;
  v_member uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select league_id into v_league from league_events where id = p_event;
  select id into v_member from league_members where league_id = v_league and user_id = auth.uid();
  if v_member is null then raise exception 'You are not in this league'; end if;
  update league_events set rsvp = coalesce(rsvp, '{}'::jsonb) || jsonb_build_object(v_member::text, p_in) where id = p_event;
  if p_in then
    update league_members set invite_status = 'accepted' where id = v_member;
    update notifications set read_at = now() where user_id = auth.uid() and type = 'league_invite' and league_id = v_league;
  end if;
  update notifications set read_at = now()
    where user_id = auth.uid() and type = 'round_added' and event_id = p_event;
end;
$$;
revoke all on function public.respond_round(uuid, boolean) from public, anon;
grant execute on function public.respond_round(uuid, boolean) to authenticated;
