-- Running tabs: what friends owe each other across many rounds, paid off
-- whenever they like ("cash out every 3 months"). Scribble only keeps track;
-- it never holds or moves money.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs casual_rounds.sql (casual rounds) and leagues.sql (league rounds).
--
-- tab_entries: one row per pair per thing that changes a tab:
--   kind 'round'  a round's settle-up added with "Add to running tab"
--                 (from_user pays to_user). source = 'casual:<roundId>' or
--                 'set:<eventId>:<setId>' (one league side-games set); each
--                 source goes on the tab once.
--   kind 'paid'   from_user paid to_user; recorded by the person who got
--                 paid (to_user), never by the payer.
-- Only the two people in a row can read it.

create table if not exists public.tab_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('round', 'paid')),
  source text,
  label text check (length(label) <= 200),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  from_name text check (length(from_name) <= 100),
  to_name text check (length(to_name) <= 100),
  cents int not null check (cents > 0 and cents <= 10000000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index if not exists tab_entries_from on public.tab_entries(from_user);
create index if not exists tab_entries_to on public.tab_entries(to_user);
create unique index if not exists tab_entries_once
  on public.tab_entries(source, from_user, to_user) where kind = 'round';

alter table public.tab_entries enable row level security;
drop policy if exists "pair reads tab" on public.tab_entries;
create policy "pair reads tab" on public.tab_entries for select to authenticated
  using (auth.uid() in (from_user, to_user));
-- The person who got paid can take back a "paid" they recorded by mistake.
drop policy if exists "payee undoes paid" on public.tab_entries;
create policy "payee undoes paid" on public.tab_entries for delete to authenticated
  using (kind = 'paid' and to_user = auth.uid());
grant select, delete on public.tab_entries to authenticated;
-- Inserts only through the functions below.

-- Is this account playing in the round/set behind a source?
create or replace function public.tab_source_player(p_source text, p_user uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(p_source, ':');
begin
  if parts[1] = 'casual' then
    return exists (select 1 from casual_round_players where round_id = parts[2] and user_id = p_user);
  elsif parts[1] = 'set' then
    return exists (
      select 1 from league_events e
      join league_members m on m.league_id = e.league_id
      where e.id::text = parts[2] and m.user_id = p_user and m.role <> 'viewer'
    );
  end if;
  return false;
end $$;

-- Add one round's (or one side-games set's) settle-up to the running tabs.
-- p_payments: [{from_user, to_user, from_name, to_name, cents}]. The caller
-- and everyone named must be in the round. Already added: skipped.
-- Returns how many payments went on.
create or replace function public.add_to_tab(p_source text, p_label text, p_payments jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  p jsonb;
  n int := 0;
  got int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_source is null or length(p_source) > 200 then raise exception 'Bad round'; end if;
  if not public.tab_source_player(p_source, auth.uid()) then raise exception 'You are not in this round'; end if;
  for p in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    if not public.tab_source_player(p_source, (p->>'from_user')::uuid)
       or not public.tab_source_player(p_source, (p->>'to_user')::uuid) then
      raise exception 'Everyone on the tab must be in the round';
    end if;
  end loop;
  for p in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    insert into tab_entries (kind, source, label, from_user, to_user, from_name, to_name, cents)
      values ('round', p_source, left(p_label, 200), (p->>'from_user')::uuid, (p->>'to_user')::uuid,
              left(p->>'from_name', 100), left(p->>'to_name', 100), (p->>'cents')::int)
      on conflict (source, from_user, to_user) where kind = 'round' do nothing;
    get diagnostics got = row_count;
    n := n + got;
  end loop;
  return n;
end $$;

-- Which of these sources are already on a tab (for "On the running tab ✓").
create or replace function public.tab_sources_added(p_sources text[]) returns setof text
language sql stable security definer set search_path = public as $$
  select distinct source from tab_entries
  where kind = 'round' and source = any (p_sources)
    and public.tab_source_player(source, auth.uid());
$$;

-- I got paid: p_from paid me p_cents (all or part of what they owe me).
create or replace function public.mark_tab_paid(p_from uuid, p_cents int, p_from_name text, p_to_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  owed bigint;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_cents is null or p_cents <= 0 then raise exception 'Enter an amount'; end if;
  select coalesce(sum(case
      when kind = 'round' and from_user = p_from then cents
      when kind = 'round' then -cents
      when kind = 'paid' and from_user = p_from then -cents
      else cents end), 0)
    into owed
    from tab_entries
    where (from_user = p_from and to_user = auth.uid()) or (from_user = auth.uid() and to_user = p_from);
  if p_cents > owed then raise exception 'That''s more than they owe you'; end if;
  insert into tab_entries (kind, label, from_user, to_user, from_name, to_name, cents)
    values ('paid', 'Paid', p_from, auth.uid(), left(p_from_name, 100), left(p_to_name, 100), p_cents);
end $$;

revoke all on function public.tab_source_player(text, uuid) from public, anon;
revoke all on function public.add_to_tab(text, text, jsonb) from public, anon;
revoke all on function public.tab_sources_added(text[]) from public, anon;
revoke all on function public.mark_tab_paid(uuid, int, text, text) from public, anon;
grant execute on function public.add_to_tab(text, text, jsonb) to authenticated;
grant execute on function public.tab_sources_added(text[]) to authenticated;
grant execute on function public.mark_tab_paid(uuid, int, text, text) to authenticated;
