-- Owner dashboard (scribblegolfclub.com/admin): who uses the app and how.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs schema.sql, leagues.sql, social.sql, saves_messages.sql.
--
-- After running it, make yourself an owner (once, with your sign-in email):
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'YOUR-EMAIL' on conflict do nothing;

-- Owners: the only accounts that can read the stats.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policies: nobody reads or writes it through the API; only the
-- functions below (and the SQL Editor) use it.

-- One row per person per day they opened the app (no other tracking).
create table if not exists public.app_visits (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  first_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists app_visits_day_idx on public.app_visits (day);
alter table public.app_visits enable row level security;

-- Things that only happen on the phone (casual rounds live on the device).
create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('round_started')),
  created_at timestamptz not null default now()
);
create index if not exists app_events_kind_idx on public.app_events (kind, created_at);
alter table public.app_events enable row level security;

-- The app calls these (signed in). Days follow Pacific time.
create or replace function public.log_visit() returns void
language sql security definer set search_path = public as $$
  insert into app_visits (user_id, day)
  select auth.uid(), (now() at time zone 'America/Los_Angeles')::date
  where auth.uid() is not null
  on conflict do nothing;
$$;
revoke all on function public.log_visit() from public, anon;
grant execute on function public.log_visit() to authenticated;

create or replace function public.log_event(p_kind text) returns void
language sql security definer set search_path = public as $$
  insert into app_events (user_id, kind)
  select auth.uid(), p_kind
  where auth.uid() is not null and p_kind in ('round_started');
$$;
revoke all on function public.log_event(text) from public, anon;
grant execute on function public.log_event(text) to authenticated;

create or replace function public.am_i_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;
revoke all on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;

-- Everything the dashboard shows, in one call. Owners only.
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare
  tz text := 'America/Los_Angeles';
  today date := (now() at time zone 'America/Los_Angeles')::date;
  this_week date := date_trunc('week', (now() at time zone 'America/Los_Angeles'))::date;
  result jsonb;
begin
  if not exists (select 1 from app_admins where user_id = auth.uid()) then
    raise exception 'Not an owner account';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'today', today,
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'users_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'users_before_window', (select count(*) from auth.users where (created_at at time zone tz)::date < this_week - 25 * 7),
    'dau', (select count(*) from app_visits where day = today),
    'wau', (select count(distinct user_id) from app_visits where day > today - 7),
    'mau', (select count(distinct user_id) from app_visits where day > today - 30),
    'tracking_since', (select min(day) from app_visits),

    -- New accounts per week, last 26 weeks.
    'signups_weekly', coalesce((
      select jsonb_agg(jsonb_build_object('week', w, 'n', n) order by w)
      from (
        select date_trunc('week', created_at at time zone tz)::date as w, count(*) as n
        from auth.users
        where (created_at at time zone tz)::date >= this_week - 25 * 7
        group by 1
      ) x), '[]'::jsonb),

    -- People who opened the app each day, last 90 days.
    'active_daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day)
      from (select day, count(*) as n from app_visits where day > today - 90 group by day) x), '[]'::jsonb),

    -- Weekly active users, last 26 weeks.
    'active_weekly', coalesce((
      select jsonb_agg(jsonb_build_object('week', w, 'n', n) order by w)
      from (
        select date_trunc('week', day)::date as w, count(distinct user_id) as n
        from app_visits where day >= this_week - 25 * 7 group by 1
      ) x), '[]'::jsonb),

    -- Retention: of the people who joined each week (last 12), how many
    -- came back in each of the following 8 weeks.
    'retention', coalesce((
      with c as (
        select id, date_trunc('week', created_at at time zone tz)::date as wk
        from auth.users where (created_at at time zone tz)::date >= this_week - 11 * 7
      ),
      v as (select distinct user_id, date_trunc('week', day)::date as vw from app_visits)
      select jsonb_agg(jsonb_build_object('week', wk, 'size', size, 'back', back) order by wk)
      from (
        select c.wk, count(*) as size,
          (select jsonb_agg(coalesce(q.cnt, 0) order by k)
             from generate_series(1, 8) k
             left join lateral (
               select count(distinct v.user_id) as cnt
               from v join c c2 on c2.id = v.user_id
               where c2.wk = c.wk and v.vw = c.wk + k * 7
             ) q on true
             where c.wk + k * 7 <= this_week) as back
        from c group by c.wk
      ) t), '[]'::jsonb),

    -- What people did each week, last 26 weeks.
    'activity_weekly', coalesce((
      select jsonb_agg(jsonb_build_object('week', w, 'casual_rounds', cr, 'league_cards', lc, 'posts', po, 'likes', li, 'comments', co, 'messages', me) order by w)
      from (
        select g.w,
          (select count(*) from app_events e where e.kind = 'round_started' and date_trunc('week', e.created_at at time zone tz)::date = g.w) as cr,
          (select count(*) from event_scores s where date_trunc('week', s.updated_at at time zone tz)::date = g.w) as lc,
          (select count(*) from posts p where date_trunc('week', p.created_at at time zone tz)::date = g.w) as po,
          (select count(*) from post_likes l where date_trunc('week', l.created_at at time zone tz)::date = g.w) as li,
          (select count(*) from post_comments m where date_trunc('week', m.created_at at time zone tz)::date = g.w) as co,
          (select count(*) from messages d where date_trunc('week', d.created_at at time zone tz)::date = g.w) as me
        from (select (this_week - k * 7) as w from generate_series(0, 25) k) g
      ) x), '[]'::jsonb),

    'totals', jsonb_build_object(
      'leagues', (select count(*) from leagues where coalesce(settings ->> 'kind', 'league') = 'league'),
      'tournaments', (select count(*) from leagues where settings ->> 'kind' = 'tournament'),
      'league_rounds', (select count(*) from league_events),
      'league_rounds_scored', (select count(distinct event_id) from event_scores),
      'score_cards', (select count(*) from event_scores),
      'players_in_leagues', (select count(distinct user_id) from league_members where user_id is not null),
      'casual_rounds', (select count(*) from app_events where kind = 'round_started'),
      'posts', (select count(*) from posts),
      'likes', (select count(*) from post_likes),
      'comments', (select count(*) from post_comments),
      'follows', (select count(*) from follows),
      'messages', (select count(*) from messages)
    ),

    -- Most active people (days they opened the app, last 30 days).
    'top_users', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'days', days, 'last', last) order by days desc, last desc)
      from (
        select coalesce(nullif(p.name, ''), 'Golfer') as name, count(*) as days, max(v.day) as last
        from app_visits v left join profiles p on p.id = v.user_id
        where v.day > today - 30
        group by v.user_id, p.name
        order by count(*) desc, max(v.day) desc
        limit 10
      ) x), '[]'::jsonb),

    -- Courses most played in league and tournament rounds.
    'top_courses', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'rounds', n) order by n desc)
      from (
        select course ->> 'name' as name, count(*) as n
        from league_events where coalesce(course ->> 'name', '') <> ''
        group by 1 order by 2 desc limit 10
      ) x), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
