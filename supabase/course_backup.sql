-- Shared course backup: every course a member picks from OpenGolfAPI search
-- is saved here (the API's full answer: holes, pars, stroke indexes, tees,
-- ratings, slopes). When OpenGolfAPI is down, search and course loading fall
-- back to these (src/lib/courseBackup.js). Grows with the courses members
-- actually play.
-- Data from OpenGolfAPI / OpenStreetMap is ODbL 1.0: this copy is a derived
-- database, so it stays openly readable and the app shows the attribution.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.

create table if not exists public.course_backup (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,40}$'), -- OpenGolfAPI course id
  name text not null default '',
  place text not null default '',
  lat double precision,
  lng double precision,
  detail jsonb not null,
  saved_at timestamptz not null default now()
);
create index if not exists course_backup_name_idx on public.course_backup (lower(name));
alter table public.course_backup enable row level security;

-- Openly readable (ODbL); written only through save_course_backup().
drop policy if exists "anyone reads course backup" on public.course_backup;
create policy "anyone reads course backup" on public.course_backup for select to anon, authenticated using (true);
grant select on public.course_backup to anon, authenticated;

-- Save (or refresh) one course as OpenGolfAPI returned it. Signed-in members
-- only; size-capped; keeps the course id the API uses.
create or replace function public.save_course_backup(p_id text, p_detail jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_id !~ '^[A-Za-z0-9_-]{1,40}$' or p_detail is null or jsonb_typeof(p_detail) <> 'object'
     or octet_length(p_detail::text) > 200000 then
    return;
  end if;
  insert into course_backup (id, name, place, lat, lng, detail, saved_at)
  values (
    p_id,
    left(coalesce(p_detail ->> 'course_name', p_detail ->> 'name', ''), 200),
    left(concat_ws(', ', nullif(p_detail ->> 'city', ''), nullif(p_detail ->> 'state', '')), 200),
    case when jsonb_typeof(p_detail -> 'lat') = 'number' then (p_detail ->> 'lat')::double precision end,
    case when jsonb_typeof(p_detail -> 'lng') = 'number' then (p_detail ->> 'lng')::double precision end,
    p_detail,
    now()
  )
  on conflict (id) do update
    set name = excluded.name, place = excluded.place, lat = excluded.lat, lng = excluded.lng,
        detail = excluded.detail, saved_at = now();
end;
$$;
revoke all on function public.save_course_backup(text, jsonb) from public, anon;
grant execute on function public.save_course_backup(text, jsonb) to authenticated;
