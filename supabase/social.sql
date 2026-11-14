-- Social feed: public profiles, posts with photos/videos, likes, comments,
-- follows, reports, and a storage bucket for media.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.

-- What other members can see about you. (Your handicap index and GHIN number
-- stay private in `profiles`.)
create table if not exists public.public_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text not null default '',
  bio text not null default '' check (length(bio) <= 300),
  avatar_path text,
  home_course text,
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.public_profiles (id) on delete cascade,
  caption text not null default '' check (length(caption) <= 2200),
  course_key text,      -- e.g. "oga-<OpenGolfAPI id>" for location pages
  course_name text,
  course_place text,
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_user_idx on public.posts (user_id, created_at desc);
create index if not exists posts_course_idx on public.posts (course_key, created_at desc);

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  position int not null default 0,
  kind text not null check (kind in ('image', 'video')),
  path text not null,
  poster_path text,
  width int,
  height int
);
create index if not exists post_media_post_idx on public.post_media (post_id, position);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.public_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.public_profiles (id) on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

create table if not exists public.follows (
  follower uuid not null default auth.uid() references public.public_profiles (id) on delete cascade,
  followee uuid not null references public.public_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee_idx on public.follows (followee);

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null default '' check (length(reason) <= 500),
  created_at timestamptz not null default now()
);

alter table public.public_profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.follows enable row level security;
alter table public.post_reports enable row level security;

-- Signed-in members can see everything social; you can only change your own.
drop policy if exists "read profiles" on public.public_profiles;
drop policy if exists "own profile insert" on public.public_profiles;
drop policy if exists "own profile update" on public.public_profiles;
create policy "read profiles" on public.public_profiles for select to authenticated using (true);
create policy "own profile insert" on public.public_profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile update" on public.public_profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "read posts" on public.posts;
drop policy if exists "own posts insert" on public.posts;
drop policy if exists "own posts update" on public.posts;
drop policy if exists "own posts delete" on public.posts;
create policy "read posts" on public.posts for select to authenticated using (true);
create policy "own posts insert" on public.posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own posts update" on public.posts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own posts delete" on public.posts for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "read media" on public.post_media;
drop policy if exists "own media insert" on public.post_media;
drop policy if exists "own media delete" on public.post_media;
create policy "read media" on public.post_media for select to authenticated using (true);
create policy "own media insert" on public.post_media for insert to authenticated
  with check (exists (select 1 from posts p where p.id = post_id and p.user_id = (select auth.uid())));
create policy "own media delete" on public.post_media for delete to authenticated
  using (exists (select 1 from posts p where p.id = post_id and p.user_id = (select auth.uid())));

drop policy if exists "read likes" on public.post_likes;
drop policy if exists "own likes insert" on public.post_likes;
drop policy if exists "own likes delete" on public.post_likes;
create policy "read likes" on public.post_likes for select to authenticated using (true);
create policy "own likes insert" on public.post_likes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own likes delete" on public.post_likes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "read comments" on public.post_comments;
drop policy if exists "own comments insert" on public.post_comments;
drop policy if exists "own or post owner deletes comment" on public.post_comments;
create policy "read comments" on public.post_comments for select to authenticated using (true);
create policy "own comments insert" on public.post_comments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own or post owner deletes comment" on public.post_comments for delete to authenticated
  using ((select auth.uid()) = user_id or exists (select 1 from posts p where p.id = post_id and p.user_id = (select auth.uid())));

drop policy if exists "read follows" on public.follows;
drop policy if exists "own follows insert" on public.follows;
drop policy if exists "own follows delete" on public.follows;
create policy "read follows" on public.follows for select to authenticated using (true);
create policy "own follows insert" on public.follows for insert to authenticated with check ((select auth.uid()) = follower);
create policy "own follows delete" on public.follows for delete to authenticated using ((select auth.uid()) = follower);

-- Reports are write-only for members; review them in the Supabase dashboard.
drop policy if exists "own reports insert" on public.post_reports;
create policy "own reports insert" on public.post_reports for insert to authenticated with check ((select auth.uid()) = user_id);

grant select, insert, update on public.public_profiles to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, delete on public.post_media to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.post_comments to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant insert on public.post_reports to authenticated;

-- Photos and videos. Public URLs (hard-to-guess paths) so images load fast;
-- each member can only upload into, or delete from, their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media upload own folder" on storage.objects;
drop policy if exists "media delete own folder" on storage.objects;
create policy "media upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
