-- Golf App database. Paste into Supabase: SQL Editor -> New query -> Run.
-- Safe to run again: it only creates what's missing and replaces policies.

-- One profile per signed-in user.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  ghin_number text,
  handicap_index numeric(4, 1) check (handicap_index between -10 and 54),
  home_course text,
  updated_at timestamptz not null default now()
);

-- Regular playing partners a user keeps for quick round setup.
-- Private to the user who saved them (not linked to anyone's account yet).
create table if not exists public.saved_players (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  ghin_number text,
  handicap_index numeric(4, 1) check (handicap_index between -10 and 54),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_players_owner_idx on public.saved_players (owner_id);

alter table public.profiles enable row level security;
alter table public.saved_players enable row level security;

-- Each user can only see and change their own rows.
drop policy if exists "own profile: read" on public.profiles;
drop policy if exists "own profile: insert" on public.profiles;
drop policy if exists "own profile: update" on public.profiles;
create policy "own profile: read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "own profile: insert" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile: update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "own saved players: all" on public.saved_players;
create policy "own saved players: all" on public.saved_players
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.saved_players to authenticated;
