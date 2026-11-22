-- Course ratings (1-5 stars: conditions, layout, price, difficulty, pace of
-- play) and the
-- daily cap on AI round recaps. Paste into Supabase: SQL Editor -> New query
-- -> Run. Safe to run again.

-- One rating per golfer per course; rating again replaces it. course_key is
-- the shared course id ("oga-<id>" from OpenGolfAPI, "sc-…" built in), the
-- same key posts use, so a course page shows ratings next to its photos.
create table if not exists public.course_ratings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_key text not null check (course_key ~ '^(oga|sc)-'),
  course_name text not null default '',
  conditions smallint not null check (conditions between 1 and 5),
  layout smallint not null check (layout between 1 and 5),
  price smallint not null check (price between 1 and 5),
  difficulty smallint not null check (difficulty between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, course_key)
);
-- Pace of play (5 = quick round). Added later, so older ratings have none.
alter table public.course_ratings add column if not exists pace smallint check (pace between 1 and 5);
create index if not exists course_ratings_key_idx on public.course_ratings (course_key);
alter table public.course_ratings enable row level security;

-- You see and change only your own rating rows; everyone gets the averages
-- from course_rating_summary() below.
drop policy if exists "own ratings read" on public.course_ratings;
create policy "own ratings read" on public.course_ratings
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "own ratings insert" on public.course_ratings;
create policy "own ratings insert" on public.course_ratings
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own ratings update" on public.course_ratings;
create policy "own ratings update" on public.course_ratings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own ratings delete" on public.course_ratings;
create policy "own ratings delete" on public.course_ratings
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.touch_course_rating() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists course_ratings_touch on public.course_ratings;
create trigger course_ratings_touch before update on public.course_ratings
  for each row execute function public.touch_course_rating();

-- Averages per course (one decimal) for a list of course keys.
drop function if exists public.course_rating_summary(text[]);
create or replace function public.course_rating_summary(p_keys text[])
returns table (course_key text, ratings bigint, conditions numeric, layout numeric, price numeric, difficulty numeric, pace numeric)
language sql stable security definer set search_path = public as $$
  select r.course_key, count(*),
         round(avg(r.conditions), 1), round(avg(r.layout), 1),
         round(avg(r.price), 1), round(avg(r.difficulty), 1), round(avg(r.pace), 1)
  from course_ratings r
  where r.course_key = any (p_keys[1:100])
  group by r.course_key;
$$;
revoke all on function public.course_rating_summary(text[]) from public, anon;
grant execute on function public.course_rating_summary(text[]) to authenticated;

-- AI recaps: one row per recap written (the round-recap Edge Function calls
-- claim_recap() first). 20 a day per person keeps the AI bill small.
create table if not exists public.ai_recaps (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_recaps_user_idx on public.ai_recaps (user_id, created_at);
alter table public.ai_recaps enable row level security;
-- No policies: only claim_recap() (and the SQL Editor) touch it.

create or replace function public.claim_recap() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if (select count(*) from ai_recaps where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    return false;
  end if;
  insert into ai_recaps (user_id) values (auth.uid());
  return true;
end;
$$;
revoke all on function public.claim_recap() from public, anon;
grant execute on function public.claim_recap() to authenticated;

-- One shared recap per foursome in a league/tournament round, so the whole
-- group sees the same recap and it's paid for once. group_key = the group's
-- player keys, sorted, joined with commas. Written only by the round-recap
-- Edge Function through these functions; readable by league members.
create table if not exists public.round_recaps (
  event_id uuid not null references public.league_events (id) on delete cascade,
  group_key text not null,
  recap text,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz not null default now(),
  primary key (event_id, group_key)
);
alter table public.round_recaps enable row level security;
-- No policies: only the functions below touch it.

-- Ready recap, or claim the job of writing it. Returns
-- {status: 'ready', recap} | {status: 'writing'} | {status: 'claimed'} | {status: 'denied'}.
-- A claim nobody finished in 2 minutes can be taken over.
create or replace function public.start_round_recap(p_event uuid, p_group text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r round_recaps;
begin
  if auth.uid() is null or not exists (
    select 1 from league_events e where e.id = p_event and is_league_member(e.league_id)
  ) then
    return jsonb_build_object('status', 'denied');
  end if;
  insert into round_recaps (event_id, group_key, claimed_by)
  values (p_event, left(p_group, 500), auth.uid())
  on conflict do nothing;
  if found then return jsonb_build_object('status', 'claimed'); end if;
  select * into r from round_recaps where event_id = p_event and group_key = left(p_group, 500);
  if r.recap is not null then return jsonb_build_object('status', 'ready', 'recap', r.recap); end if;
  if r.claimed_at < now() - interval '2 minutes' then
    update round_recaps set claimed_by = auth.uid(), claimed_at = now()
    where event_id = p_event and group_key = left(p_group, 500) and recap is null;
    return jsonb_build_object('status', 'claimed');
  end if;
  return jsonb_build_object('status', 'writing');
end;
$$;
revoke all on function public.start_round_recap(uuid, text) from public, anon;
grant execute on function public.start_round_recap(uuid, text) to authenticated;

-- Save the recap you claimed (null gives the claim back after a failure).
create or replace function public.finish_round_recap(p_event uuid, p_group text, p_recap text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_recap is null then
    delete from round_recaps
    where event_id = p_event and group_key = left(p_group, 500) and recap is null and claimed_by = auth.uid();
  else
    update round_recaps set recap = left(p_recap, 4000)
    where event_id = p_event and group_key = left(p_group, 500) and recap is null and claimed_by = auth.uid();
  end if;
end;
$$;
revoke all on function public.finish_round_recap(uuid, text, text) from public, anon;
grant execute on function public.finish_round_recap(uuid, text, text) to authenticated;
