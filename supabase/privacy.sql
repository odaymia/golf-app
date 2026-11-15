-- Privacy settings: private accounts with follow requests, who can message
-- or comment, hidden like counts, and notification preferences.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs social.sql, account_safety.sql, saves_messages.sql, instructors.sql,
-- notifications.sql first.

-- ---------------------------------------------------------------------------
-- Settings others need to see (on the public profile)...
alter table public.public_profiles add column if not exists is_private boolean not null default false;
alter table public.public_profiles add column if not exists hide_like_counts boolean not null default false;

-- ...and settings only you (and the database) read.
create table if not exists public.privacy_settings (
  user_id uuid primary key default auth.uid() references public.public_profiles (id) on delete cascade,
  allow_messages text not null default 'everyone' check (allow_messages in ('everyone', 'following', 'none')),
  allow_comments text not null default 'everyone' check (allow_comments in ('everyone', 'followers', 'none')),
  notify jsonb not null default '{}'::jsonb,  -- { like, comment, follow, message, review: false } to mute
  updated_at timestamptz not null default now()
);
alter table public.privacy_settings enable row level security;
drop policy if exists "own privacy settings" on public.privacy_settings;
create policy "own privacy settings" on public.privacy_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.privacy_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Follow requests: following a private account starts as 'pending' until
-- they accept. The database decides the status, not the app.
alter table public.follows add column if not exists status text not null default 'accepted';
alter table public.follows drop constraint if exists follows_status_check;
alter table public.follows add constraint follows_status_check check (status in ('pending', 'accepted'));

create or replace function public.set_follow_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := case
    when exists (select 1 from public_profiles where id = new.followee and is_private) then 'pending'
    else 'accepted'
  end;
  return new;
end;
$$;
drop trigger if exists follows_set_status on public.follows;
create trigger follows_set_status before insert on public.follows
  for each row execute function public.set_follow_status();

-- The person being followed may accept (status) or remove (delete) a follower.
drop policy if exists "followee accepts" on public.follows;
drop policy if exists "followee removes" on public.follows;
create policy "followee accepts" on public.follows for update to authenticated
  using ((select auth.uid()) = followee) with check ((select auth.uid()) = followee and status = 'accepted');
create policy "followee removes" on public.follows for delete to authenticated using ((select auth.uid()) = followee);
grant update (status) on public.follows to authenticated;

-- Going public accepts everyone who asked.
create or replace function public.accept_requests_when_public() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_private and not new.is_private then
    update follows set status = 'accepted' where followee = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists public_profiles_go_public on public.public_profiles;
create trigger public_profiles_go_public after update of is_private on public.public_profiles
  for each row execute function public.accept_requests_when_public();

-- ---------------------------------------------------------------------------
-- Checks used by policies and triggers.

-- May I see this person's posts? (me, a public account, or an accepted follower)
create or replace function public.can_see_author(p_author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_author = auth.uid()
    or not coalesce((select is_private from public_profiles where id = p_author), false)
    or exists (select 1 from follows where follower = auth.uid() and followee = p_author and status = 'accepted');
$$;

-- May I message this person?
create or replace function public.can_dm(p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case coalesce((select allow_messages from privacy_settings where user_id = p_target), 'everyone')
    when 'everyone' then true
    when 'following' then exists (select 1 from follows where follower = p_target and followee = auth.uid() and status = 'accepted')
    else false
  end;
$$;

-- May I post in this conversation? (every other member allows my messages)
create or replace function public.conversation_allows(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from conversation_members m
    where m.conversation_id = p_conversation and m.user_id <> auth.uid() and not public.can_dm(m.user_id)
  );
$$;

-- May I comment on this post?
create or replace function public.can_comment(p_post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from posts p
    where p.id = p_post and public.can_see_author(p.user_id)
      and (
        p.user_id = auth.uid()
        or case coalesce((select allow_comments from privacy_settings where user_id = p.user_id), 'everyone')
          when 'everyone' then true
          when 'followers' then exists (select 1 from follows where follower = auth.uid() and followee = p.user_id and status = 'accepted')
          else false
        end
      )
  );
$$;

-- Does this person want this kind of notification? (on unless muted)
create or replace function public.wants_notification(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (notify ->> p_kind)::boolean from privacy_settings where user_id = p_user), true);
$$;

revoke all on function public.can_see_author(uuid) from public, anon;
revoke all on function public.can_dm(uuid) from public, anon;
revoke all on function public.conversation_allows(uuid) from public, anon;
revoke all on function public.can_comment(uuid) from public, anon;
revoke all on function public.wants_notification(uuid, text) from public, anon, authenticated;
grant execute on function public.can_see_author(uuid) to authenticated;
grant execute on function public.can_dm(uuid) to authenticated;
grant execute on function public.conversation_allows(uuid) to authenticated;
grant execute on function public.can_comment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Private accounts: posts, media, likes and comments only for those allowed.
drop policy if exists "read posts" on public.posts;
create policy "read posts" on public.posts for select to authenticated using (public.can_see_author(user_id));

drop policy if exists "read media" on public.post_media;
create policy "read media" on public.post_media for select to authenticated
  using (exists (
    select 1 from posts p where p.id = post_id
      and public.can_see_author(p.user_id)
      and (p.audience = 'public' or p.user_id = (select auth.uid()) or public.has_premium_access(p.user_id::text))
  ));

drop policy if exists "read likes" on public.post_likes;
drop policy if exists "own likes insert" on public.post_likes;
create policy "read likes" on public.post_likes for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id and public.can_see_author(p.user_id)));
create policy "own likes insert" on public.post_likes for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from posts p where p.id = post_id and public.can_see_author(p.user_id)));

drop policy if exists "read comments" on public.post_comments;
drop policy if exists "own comments insert" on public.post_comments;
create policy "read comments" on public.post_comments for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id and public.can_see_author(p.user_id)));
create policy "own comments insert" on public.post_comments for insert to authenticated
  with check ((select auth.uid()) = user_id and public.can_comment(post_id));

-- Messages respect "who can message you".
drop policy if exists "members send messages" on public.messages;
create policy "members send messages" on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and public.is_conversation_member(conversation_id)
    and not public.conversation_blocked(conversation_id)
    and public.conversation_allows(conversation_id)
  );

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
  -- An existing conversation can always be opened (to read); sending checks the setting.
  if v_id is null then
    if not public.can_dm(p_user) then raise exception 'This golfer isn''t taking messages from you'; end if;
    insert into conversations default values returning id into v_id;
    insert into conversation_members (conversation_id, user_id) values (v_id, auth.uid()), (v_id, p_user);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications: follow requests/accepts, and muting by type.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'follow', 'follow_request', 'follow_accept', 'message', 'review_request', 'review_answer'));
create unique index if not exists notifications_request_once on public.notifications (user_id, actor_id) where type = 'follow_request';

create or replace function public.notify_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from notifications where type in ('follow', 'follow_request') and user_id = old.followee and actor_id = old.follower;
    delete from notifications where type = 'follow_accept' and user_id = old.follower and actor_id = old.followee;
    return old;
  end if;
  if new.followee = new.follower or notify_blocked(new.followee, new.follower) then return new; end if;
  if tg_op = 'INSERT' and new.status = 'pending' then
    -- Requests always notify (you have to answer them).
    insert into notifications (user_id, actor_id, type) values (new.followee, new.follower, 'follow_request')
    on conflict (user_id, actor_id) where type = 'follow_request' do update set created_at = now(), read_at = null;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'accepted' then
      delete from notifications where type = 'follow_request' and user_id = new.followee and actor_id = new.follower;
      if wants_notification(new.follower, 'follow') then
        insert into notifications (user_id, actor_id, type) values (new.follower, new.followee, 'follow_accept');
      end if;
    end if;
    return new;
  end if;
  if not wants_notification(new.followee, 'follow') then return new; end if;
  insert into notifications (user_id, actor_id, type)
  values (new.followee, new.follower, 'follow')
  on conflict (user_id, actor_id) where type = 'follow'
  do update set created_at = now(), read_at = null;
  return new;
end;
$$;
drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert or update or delete on public.follows
  for each row execute function public.notify_follow();

create or replace function public.notify_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if tg_op = 'DELETE' then
    delete from notifications where type = 'like' and actor_id = old.user_id and post_id = old.post_id;
    return old;
  end if;
  select user_id into v_owner from posts where id = new.post_id;
  if v_owner is null or v_owner = new.user_id or notify_blocked(v_owner, new.user_id)
     or not wants_notification(v_owner, 'like') then return new; end if;
  insert into notifications (user_id, actor_id, type, post_id)
  values (v_owner, new.user_id, 'like', new.post_id)
  on conflict (user_id, actor_id, post_id) where type = 'like'
  do update set created_at = now(), read_at = null;
  return new;
end;
$$;

create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select user_id into v_owner from posts where id = new.post_id;
  if v_owner is null or v_owner = new.user_id or notify_blocked(v_owner, new.user_id)
     or not wants_notification(v_owner, 'comment') then return new; end if;
  insert into notifications (user_id, actor_id, type, post_id, comment_id, body)
  values (v_owner, new.user_id, 'comment', new.post_id, new.id, left(new.body, 140));
  return new;
end;
$$;

create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  for m in
    select user_id from conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    if notify_blocked(m.user_id, new.sender_id) or not wants_notification(m.user_id, 'message') then continue; end if;
    insert into notifications (user_id, actor_id, type, conversation_id, body)
    values (m.user_id, new.sender_id, 'message', new.conversation_id,
            case when length(trim(new.body)) > 0 then left(new.body, 140) else 'Sent you a post' end)
    on conflict (user_id, conversation_id) where type = 'message'
    do update set actor_id = excluded.actor_id, body = excluded.body, created_at = now(),
      count = case when notifications.read_at is null then notifications.count + 1 else 1 end,
      read_at = null;
  end loop;
  return new;
end;
$$;

create or replace function public.notify_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if wants_notification(new.instructor_id, 'review') then
      insert into notifications (user_id, actor_id, type, review_id, body)
      values (new.instructor_id, new.student_id, 'review_request', new.id, left(new.note, 140));
    end if;
  elsif new.status = 'answered' and old.status <> 'answered' and wants_notification(new.student_id, 'review') then
    insert into notifications (user_id, actor_id, type, review_id, body)
    values (new.student_id, new.instructor_id, 'review_answer', new.id, left(new.reply, 140));
  end if;
  return new;
end;
$$;
