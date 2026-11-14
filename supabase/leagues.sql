-- Leagues. Paste into Supabase: SQL Editor -> New query -> Run.
-- Run schema.sql first. Safe to run again.

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- A member is either someone with the app (user_id) or just a name the
-- commissioner added. Team is the team name, or the side in a Ryder Cup.
create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  ghin_number text,
  handicap_index numeric(4, 1) check (handicap_index between -10 and 54),
  team text,
  role text not null default 'member' check (role in ('commissioner', 'member')),
  created_at timestamptz not null default now(),
  unique (league_id, user_id)
);
create index if not exists league_members_league_idx on public.league_members (league_id);
create index if not exists league_members_user_idx on public.league_members (user_id);

-- A league round. course is a snapshot: { name, holes: [{par, hcp}], tee: {name, rating, slope} }.
-- matchups: [{ sides: [[memberId...], [memberId...]] }] for match play.
create table if not exists public.league_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null,
  event_date date,
  course jsonb not null,
  matchups jsonb not null default '[]'::jsonb,
  status text not null default 'scheduled' check (status in ('scheduled', 'final')),
  tier text not null default 'regular' check (tier in ('regular', 'major')),
  created_at timestamptz not null default now()
);
-- For databases created before tiers existed.
alter table public.league_events
  add column if not exists tier text not null default 'regular' check (tier in ('regular', 'major'));
create index if not exists league_events_league_idx on public.league_events (league_id);

create table if not exists public.event_scores (
  event_id uuid not null references public.league_events (id) on delete cascade,
  member_id uuid not null references public.league_members (id) on delete cascade,
  league_id uuid not null references public.leagues (id) on delete cascade,
  gross smallint[] not null,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index if not exists event_scores_league_idx on public.event_scores (league_id);

-- Membership checks used by the policies (security definer avoids policy recursion).
create or replace function public.is_league_member(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members where league_id = lid and user_id = auth.uid());
$$;

create or replace function public.is_league_admin(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from league_members where league_id = lid and user_id = auth.uid() and role = 'commissioner'
  );
$$;

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.league_events enable row level security;
alter table public.event_scores enable row level security;

drop policy if exists "members read league" on public.leagues;
drop policy if exists "admin updates league" on public.leagues;
drop policy if exists "admin deletes league" on public.leagues;
create policy "members read league" on public.leagues for select to authenticated using (public.is_league_member(id));
create policy "admin updates league" on public.leagues for update to authenticated
  using (public.is_league_admin(id)) with check (public.is_league_admin(id));
create policy "admin deletes league" on public.leagues for delete to authenticated using (public.is_league_admin(id));

drop policy if exists "members read members" on public.league_members;
drop policy if exists "admin adds members" on public.league_members;
drop policy if exists "admin edits members" on public.league_members;
drop policy if exists "admin removes members" on public.league_members;
create policy "members read members" on public.league_members for select to authenticated
  using (public.is_league_member(league_id));
create policy "admin adds members" on public.league_members for insert to authenticated
  with check (public.is_league_admin(league_id));
create policy "admin edits members" on public.league_members for update to authenticated
  using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));
create policy "admin removes members" on public.league_members for delete to authenticated
  using (public.is_league_admin(league_id) and user_id is distinct from auth.uid());

drop policy if exists "members read events" on public.league_events;
drop policy if exists "admin writes events" on public.league_events;
create policy "members read events" on public.league_events for select to authenticated
  using (public.is_league_member(league_id));
create policy "admin writes events" on public.league_events for all to authenticated
  using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));

-- Any member can enter scores (one phone scores the group); only for
-- rounds of their own league, and not after the round is marked final.
drop policy if exists "members read scores" on public.event_scores;
drop policy if exists "members add scores" on public.event_scores;
drop policy if exists "members edit scores" on public.event_scores;
drop policy if exists "admin removes scores" on public.event_scores;
create policy "members read scores" on public.event_scores for select to authenticated
  using (public.is_league_member(league_id));
create policy "members add scores" on public.event_scores for insert to authenticated
  with check (
    public.is_league_member(league_id)
    and exists (select 1 from league_events e where e.id = event_id and e.league_id = event_scores.league_id
                and (e.status = 'scheduled' or public.is_league_admin(e.league_id)))
    and exists (select 1 from league_members m where m.id = member_id and m.league_id = event_scores.league_id)
  );
create policy "members edit scores" on public.event_scores for update to authenticated
  using (public.is_league_member(league_id))
  with check (
    public.is_league_member(league_id)
    and exists (select 1 from league_events e where e.id = event_id and e.league_id = event_scores.league_id
                and (e.status = 'scheduled' or public.is_league_admin(e.league_id)))
    and exists (select 1 from league_members m where m.id = member_id and m.league_id = event_scores.league_id)
  );
create policy "admin removes scores" on public.event_scores for delete to authenticated
  using (public.is_league_admin(league_id));

grant select, update, delete on public.leagues to authenticated;
grant select, insert, update, delete on public.league_members to authenticated;
grant select, insert, update, delete on public.league_events to authenticated;
grant select, insert, update, delete on public.event_scores to authenticated;

-- Create a league with the caller as commissioner. Returns the league id.
create or replace function public.create_league(p_name text, p_settings jsonb, p_member_name text, p_index numeric, p_ghin text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_code text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'League needs a name'; end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from leagues where invite_code = v_code);
  end loop;
  insert into leagues (name, invite_code, settings, created_by)
    values (trim(p_name), v_code, coalesce(p_settings, '{}'::jsonb), auth.uid())
    returning id into v_id;
  insert into league_members (league_id, user_id, name, handicap_index, ghin_number, role)
    values (v_id, auth.uid(), coalesce(nullif(trim(p_member_name), ''), 'Commissioner'), p_index, p_ghin, 'commissioner');
  return v_id;
end;
$$;

-- Join with an invite code. If the commissioner already added someone with
-- the same name and no app account, that spot becomes yours.
create or replace function public.join_league(p_code text, p_member_name text, p_index numeric, p_ghin text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_league uuid;
  v_member uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into v_league from leagues where invite_code = upper(trim(p_code));
  if v_league is null then raise exception 'No league with that code'; end if;
  if exists (select 1 from league_members where league_id = v_league and user_id = auth.uid()) then
    return v_league;
  end if;
  select id into v_member from league_members
    where league_id = v_league and user_id is null and lower(trim(name)) = lower(trim(p_member_name))
    order by created_at limit 1;
  if v_member is not null then
    update league_members
      set user_id = auth.uid(),
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

revoke all on function public.create_league(text, jsonb, text, numeric, text) from public, anon;
revoke all on function public.join_league(text, text, numeric, text) from public, anon;
grant execute on function public.create_league(text, jsonb, text, numeric, text) to authenticated;
grant execute on function public.join_league(text, text, numeric, text) to authenticated;
