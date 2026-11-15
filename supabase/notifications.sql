-- Notifications: likes, comments, follows, direct messages, swing reviews.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs social.sql, account_safety.sql, saves_messages.sql, instructors.sql.
--
-- Rows are written only by the triggers below (never by the app), so every
-- like/comment/message makes one no matter which screen caused it. Members
-- read, mark read and delete their own.
--   like     one per (liker, post); removed again if they unlike
--   comment  one per comment (with a snippet)
--   follow   one per follower; removed if they unfollow
--   message  one per conversation, refreshed by each new message
--   review   a swing review sent to you (instructor) or answered (student)
-- Nothing is created for your own actions or between blocked people.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.public_profiles (id) on delete cascade,  -- who sees it
  actor_id uuid not null references public.public_profiles (id) on delete cascade, -- who did it
  type text not null check (type in ('like', 'comment', 'follow', 'message', 'review_request', 'review_answer')),
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.post_comments (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  review_id uuid references public.swing_reviews (id) on delete cascade,
  body text not null default '',
  count int not null default 1,           -- messages: unread messages in the conversation
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index if not exists notifications_like_once on public.notifications (user_id, actor_id, post_id) where type = 'like';
create unique index if not exists notifications_follow_once on public.notifications (user_id, actor_id) where type = 'follow';
create unique index if not exists notifications_message_once on public.notifications (user_id, conversation_id) where type = 'message';

alter table public.notifications enable row level security;
drop policy if exists "read own notifications" on public.notifications;
drop policy if exists "mark own read" on public.notifications;
drop policy if exists "delete own notifications" on public.notifications;
create policy "read own notifications" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "mark own read" on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own notifications" on public.notifications for delete to authenticated using ((select auth.uid()) = user_id);
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Is there a block between these two?
create or replace function public.notify_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;
revoke all on function public.notify_blocked(uuid, uuid) from public, anon, authenticated;

-- Likes -----------------------------------------------------------------------
create or replace function public.notify_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if tg_op = 'DELETE' then
    delete from notifications where type = 'like' and actor_id = old.user_id and post_id = old.post_id;
    return old;
  end if;
  select user_id into v_owner from posts where id = new.post_id;
  if v_owner is null or v_owner = new.user_id or notify_blocked(v_owner, new.user_id) then return new; end if;
  insert into notifications (user_id, actor_id, type, post_id)
  values (v_owner, new.user_id, 'like', new.post_id)
  on conflict (user_id, actor_id, post_id) where type = 'like'
  do update set created_at = now(), read_at = null;
  return new;
end;
$$;
drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify after insert or delete on public.post_likes
  for each row execute function public.notify_like();

-- Comments --------------------------------------------------------------------
create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select user_id into v_owner from posts where id = new.post_id;
  if v_owner is null or v_owner = new.user_id or notify_blocked(v_owner, new.user_id) then return new; end if;
  insert into notifications (user_id, actor_id, type, post_id, comment_id, body)
  values (v_owner, new.user_id, 'comment', new.post_id, new.id, left(new.body, 140));
  return new;
end;
$$;
drop trigger if exists post_comments_notify on public.post_comments;
create trigger post_comments_notify after insert on public.post_comments
  for each row execute function public.notify_comment();

-- Follows ---------------------------------------------------------------------
create or replace function public.notify_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from notifications where type = 'follow' and user_id = old.followee and actor_id = old.follower;
    return old;
  end if;
  if new.followee = new.follower or notify_blocked(new.followee, new.follower) then return new; end if;
  insert into notifications (user_id, actor_id, type)
  values (new.followee, new.follower, 'follow')
  on conflict (user_id, actor_id) where type = 'follow'
  do update set created_at = now(), read_at = null;
  return new;
end;
$$;
drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert or delete on public.follows
  for each row execute function public.notify_follow();

-- Direct messages: one row per conversation, counting unread messages.
create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  for m in
    select user_id from conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    if notify_blocked(m.user_id, new.sender_id) then continue; end if;
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
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_message();

-- Reading a conversation clears its message notification.
create or replace function public.notify_message_read() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_read_at is distinct from old.last_read_at then
    update notifications set read_at = now()
    where type = 'message' and user_id = new.user_id and conversation_id = new.conversation_id and read_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists conversation_read_notify on public.conversation_members;
create trigger conversation_read_notify after update on public.conversation_members
  for each row execute function public.notify_message_read();

-- Swing reviews: new request -> instructor; answered -> student.
create or replace function public.notify_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (user_id, actor_id, type, review_id, body)
    values (new.instructor_id, new.student_id, 'review_request', new.id, left(new.note, 140));
  elsif new.status = 'answered' and old.status <> 'answered' then
    insert into notifications (user_id, actor_id, type, review_id, body)
    values (new.student_id, new.instructor_id, 'review_answer', new.id, left(new.reply, 140));
  end if;
  return new;
end;
$$;
drop trigger if exists swing_reviews_notify on public.swing_reviews;
create trigger swing_reviews_notify after insert or update on public.swing_reviews
  for each row execute function public.notify_review();
