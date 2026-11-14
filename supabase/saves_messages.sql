-- Saved posts (with folders) and direct messages.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs social.sql and account_safety.sql (blocks) first.

-- ---------------------------------------------------------------------------
-- Saved posts: private to the member who saved them.
-- saved_posts is "All saved"; a post can also be in any of your folders.

create table if not exists public.saved_posts (
  user_id uuid not null default auth.uid() references public.public_profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists saved_posts_user_idx on public.saved_posts (user_id, created_at desc);

create table if not exists public.save_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.public_profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists save_folders_user_idx on public.save_folders (user_id, created_at);

create table if not exists public.save_folder_posts (
  folder_id uuid not null references public.save_folders (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.public_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (folder_id, post_id)
);
create index if not exists save_folder_posts_user_idx on public.save_folder_posts (user_id, post_id);

alter table public.saved_posts enable row level security;
alter table public.save_folders enable row level security;
alter table public.save_folder_posts enable row level security;

drop policy if exists "own saves" on public.saved_posts;
create policy "own saves" on public.saved_posts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own folders" on public.save_folders;
create policy "own folders" on public.save_folders for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own folder posts" on public.save_folder_posts;
create policy "own folder posts" on public.save_folder_posts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from save_folders f where f.id = folder_id and f.user_id = (select auth.uid()))
  );

grant select, insert, delete on public.saved_posts to authenticated;
grant select, insert, update, delete on public.save_folders to authenticated;
grant select, insert, delete on public.save_folder_posts to authenticated;

-- ---------------------------------------------------------------------------
-- Direct messages. A conversation has members (two today; the tables allow
-- groups later). Only members can read it or post in it. Blocked people
-- can't start or continue a conversation with each other.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.public_profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.public_profiles (id) on delete cascade,
  body text not null default '' check (length(body) <= 2000),
  post_id uuid references public.posts (id) on delete set null,  -- a shared post
  created_at timestamptz not null default now(),
  check (length(trim(body)) > 0 or post_id is not null)
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- Membership check that policies can use without recursion.
create or replace function public.is_conversation_member(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members where conversation_id = p_conversation and user_id = auth.uid()
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Does a block stand between me and anyone else in this conversation?
create or replace function public.conversation_blocked(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from conversation_members m
    join blocks b on (b.blocker = auth.uid() and b.blocked = m.user_id) or (b.blocker = m.user_id and b.blocked = auth.uid())
    where m.conversation_id = p_conversation and m.user_id <> auth.uid()
  );
$$;
revoke all on function public.conversation_blocked(uuid) from public, anon;
grant execute on function public.conversation_blocked(uuid) to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "members read conversations" on public.conversations;
create policy "members read conversations" on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "members read members" on public.conversation_members;
drop policy if exists "update own read time" on public.conversation_members;
create policy "members read members" on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy "update own read time" on public.conversation_members for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "members read messages" on public.messages;
drop policy if exists "members send messages" on public.messages;
drop policy if exists "delete own messages" on public.messages;
create policy "members read messages" on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy "members send messages" on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and public.is_conversation_member(conversation_id)
    and not public.conversation_blocked(conversation_id)
  );
create policy "delete own messages" on public.messages for delete to authenticated
  using ((select auth.uid()) = sender_id);

grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
grant select, insert, delete on public.messages to authenticated;

-- New messages move the conversation to the top of everyone's inbox.
create or replace function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  update conversation_members set last_read_at = new.created_at
    where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end;
$$;
drop trigger if exists messages_touch on public.messages;
create trigger messages_touch after insert on public.messages
  for each row execute function public.touch_conversation();

-- Open (or start) the one-to-one conversation with someone.
create or replace function public.start_dm(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_user = auth.uid() then raise exception 'You can''t message yourself'; end if;
  if not exists (select 1 from public_profiles where id = p_user) then raise exception 'That golfer wasn''t found'; end if;
  if exists (select 1 from blocks where (blocker = auth.uid() and blocked = p_user) or (blocker = p_user and blocked = auth.uid())) then
    raise exception 'You can''t message this golfer';
  end if;
  select c.id into v_id
  from conversations c
  where (select count(*) from conversation_members m where m.conversation_id = c.id) = 2
    and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid())
    and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = p_user)
  limit 1;
  if v_id is null then
    insert into conversations default values returning id into v_id;
    insert into conversation_members (conversation_id, user_id) values (v_id, auth.uid()), (v_id, p_user);
  end if;
  return v_id;
end;
$$;
revoke all on function public.start_dm(uuid) from public, anon;
grant execute on function public.start_dm(uuid) to authenticated;
