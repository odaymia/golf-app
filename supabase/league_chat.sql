-- Tournament / league chat: one chat room per league or tournament, open
-- to everyone in it (players, the organizer and people watching).
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
--
-- Rules (enforced here, not in the app):
--   * Only members of the league read or post; you post only as yourself.
--   * Blocked people don't see each other's messages (either way).
--   * You can delete your own messages; commissioners can delete any.
--   * Reports are write-only (review them in the Table Editor).

create table if not exists public.league_chat (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists league_chat_league_idx on public.league_chat (league_id, created_at desc);

alter table public.league_chat enable row level security;

drop policy if exists "members read chat" on public.league_chat;
drop policy if exists "members post chat" on public.league_chat;
drop policy if exists "delete own or commissioner" on public.league_chat;

create policy "members read chat" on public.league_chat for select to authenticated
  using (
    public.is_league_member(league_id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker = (select auth.uid()) and b.blocked = league_chat.user_id)
         or (b.blocker = league_chat.user_id and b.blocked = (select auth.uid()))
    )
  );

create policy "members post chat" on public.league_chat for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_league_member(league_id));

create policy "delete own or commissioner" on public.league_chat for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_league_admin(league_id));

grant select, insert, delete on public.league_chat to authenticated;

-- Reported chat messages (required by the App Store for anything people post).
create table if not exists public.league_chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.league_chat (id) on delete set null,
  league_id uuid not null,
  reported_user uuid,
  body text,
  reporter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.league_chat_reports enable row level security;
drop policy if exists "members report chat" on public.league_chat_reports;
create policy "members report chat" on public.league_chat_reports for insert to authenticated
  with check (reporter = (select auth.uid()) and public.is_league_member(league_id));
grant insert on public.league_chat_reports to authenticated;
