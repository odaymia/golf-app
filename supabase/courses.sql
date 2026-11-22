-- Our own copy of the OpenGolfAPI course database, so course search keeps
-- working when api.opengolfapi.org is down.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again:
-- re-running refreshes every course from the latest published data.
--
-- Data: https://github.com/opengolfapi/data (about 16,000 US courses: name,
-- place, GPS, hole-by-hole par and stroke index; no tee ratings/slopes).
-- License: Open Database License (ODbL) 1.0. This table is a derived
-- database, so it must stay open (anyone may read it) and keep the
-- attribution "Contains data from OpenGolfAPI (opengolfapi.org)" /
-- "© OpenStreetMap contributors (ODbL 1.0)" wherever results are shown.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists http with schema extensions;

create table if not exists public.courses (
  id uuid primary key,              -- same id as OpenGolfAPI (app keys courses 'oga-<id>')
  name text not null,
  city text,
  state text,
  country text,
  type text,
  holes int,
  par int,
  lat double precision,
  lng double precision,
  total_yardage int,
  address text,
  postal_code text,
  phone text,
  website text,
  scorecard jsonb not null default '[]'::jsonb,   -- [{ hole, par, handicap_index }]
  source_updated_at timestamptz,
  imported_at timestamptz not null default now()
);
create index if not exists courses_name_trgm on public.courses using gin (name extensions.gin_trgm_ops);
create index if not exists courses_state_idx on public.courses (state);

-- Open data: anyone may read it; only this script (run as the database
-- owner) writes it.
alter table public.courses enable row level security;
drop policy if exists "anyone reads courses" on public.courses;
create policy "anyone reads courses" on public.courses for select to anon, authenticated using (true);
grant select on public.courses to anon, authenticated;

-- Search by name, typo-tolerant ("steel canyon" finds Steele Canyon).
-- exact = the name contains what was typed; the rest are close matches.
create or replace function public.search_courses(q text, lim int default 15)
returns table (id uuid, name text, city text, state text, holes int, par int, lat double precision, lng double precision, type text, exact boolean)
language sql
stable
set search_path = public, extensions
as $$
  with t as (select trim(q) as q)
  select c.id, c.name, c.city, c.state, c.holes, c.par, c.lat, c.lng, c.type,
         c.name ilike '%' || t.q || '%' as exact
  from public.courses c, t
  where length(t.q) >= 2
    and (c.name ilike '%' || t.q || '%' or t.q <% c.name)
  order by (c.name ilike t.q || '%') desc,
           (c.name ilike '%' || t.q || '%') desc,
           word_similarity(t.q, c.name) desc,
           c.name
  limit least(greatest(coalesce(lim, 15), 1), 50);
$$;
grant execute on function public.search_courses(text, int) to anon, authenticated;

-- Load (or refresh) every course from the published file.
set statement_timeout = '5min';
-- The http extension gives up after 5 s by default; the file is ~14 MB.
select extensions.http_set_curlopt('CURLOPT_TIMEOUT', '120');
with src as (
  select content
  from extensions.http_get('https://raw.githubusercontent.com/opengolfapi/data/main/opengolfapi-us.ndjson')
),
lines as (
  select line::jsonb as f
  from src, regexp_split_to_table(src.content, E'\n') as line
  where btrim(line) <> ''
),
recs as (
  select f -> 'properties' as p, f -> 'geometry' -> 'coordinates' as xy from lines
)
insert into public.courses as c (
  id, name, city, state, country, type, holes, par, lat, lng, total_yardage,
  address, postal_code, phone, website, scorecard, source_updated_at, imported_at
)
select (p ->> 'id')::uuid,
       p ->> 'name',
       nullif(p ->> 'city', ''),
       nullif(p ->> 'state', ''),
       nullif(p ->> 'country', ''),
       nullif(p ->> 'type', ''),
       (p ->> 'holes')::int,
       (p ->> 'par')::int,
       (xy ->> 1)::double precision,
       (xy ->> 0)::double precision,
       (p ->> 'total_yardage')::int,
       nullif(p ->> 'address', ''),
       nullif(p ->> 'postal_code', ''),
       nullif(p ->> 'phone', ''),
       nullif(p ->> 'website', ''),
       coalesce(p -> 'scorecard', '[]'::jsonb),
       (p ->> 'updated_at')::timestamptz,
       now()
from recs
where p ->> 'id' is not null and coalesce(p ->> 'name', '') <> ''
on conflict (id) do update set
  name = excluded.name, city = excluded.city, state = excluded.state, country = excluded.country,
  type = excluded.type, holes = excluded.holes, par = excluded.par, lat = excluded.lat, lng = excluded.lng,
  total_yardage = excluded.total_yardage, address = excluded.address, postal_code = excluded.postal_code,
  phone = excluded.phone, website = excluded.website, scorecard = excluded.scorecard,
  source_updated_at = excluded.source_updated_at, imported_at = excluded.imported_at;

select count(*) as courses_loaded from public.courses;
