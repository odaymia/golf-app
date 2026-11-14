-- Blocking and in-app account deletion (both required by the App Store and
-- Google Play). Paste into Supabase: SQL Editor -> New query -> Run.
-- Safe to run again.

create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked);

alter table public.blocks enable row level security;
-- You see blocks you made and blocks against you (so both sides hide each other).
drop policy if exists "see own blocks" on public.blocks;
drop policy if exists "add own blocks" on public.blocks;
drop policy if exists "remove own blocks" on public.blocks;
create policy "see own blocks" on public.blocks for select to authenticated
  using ((select auth.uid()) in (blocker, blocked));
create policy "add own blocks" on public.blocks for insert to authenticated with check ((select auth.uid()) = blocker);
create policy "remove own blocks" on public.blocks for delete to authenticated using ((select auth.uid()) = blocker);
grant select, insert, delete on public.blocks to authenticated;

-- Blocking someone also ends any follow in either direction.
create or replace function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into blocks (blocker, blocked) values (auth.uid(), p_user) on conflict do nothing;
  delete from follows where (follower = auth.uid() and followee = p_user) or (follower = p_user and followee = auth.uid());
end;
$$;
revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- Let members list (and so delete) files in their own media folder.
drop policy if exists "media list own folder" on storage.objects;
create policy "media list own folder" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Delete my account. Removes the sign-in and, by cascade, the profile,
-- golf profile, posts, likes, comments, follows, blocks and saved players.
-- League and tournament spots stay as name-only players so past results
-- still add up. The app deletes the member's photos and videos first.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
