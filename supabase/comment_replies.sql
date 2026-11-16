-- Comment replies and @mentions.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs social.sql, account_safety.sql, notifications.sql, privacy.sql first.
--
-- Replies are one level deep (like Instagram): replying to a reply attaches
-- to the top comment. Notifications (made here, never by the app):
--   comment  the post's owner, for a new top-level comment
--   reply    the author of the comment being replied to
--   mention  anyone tagged as @username who can see the post
-- Each person gets at most one of these per comment; none for yourself,
-- between blocked people, or if they muted comment notifications.

alter table public.post_comments add column if not exists parent_id uuid references public.post_comments (id) on delete cascade;
create index if not exists post_comments_parent_idx on public.post_comments (parent_id);

-- Keep replies one level deep and on the same post.
create or replace function public.comment_parent_fix() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.parent_id is null then return new; end if;
  select id, post_id, parent_id into p from post_comments where id = new.parent_id;
  if p.id is null or p.post_id <> new.post_id then
    raise exception 'That comment isn''t on this post';
  end if;
  if p.parent_id is not null then new.parent_id := p.parent_id; end if;
  return new;
end;
$$;
drop trigger if exists post_comments_parent on public.post_comments;
create trigger post_comments_parent before insert on public.post_comments
  for each row execute function public.comment_parent_fix();

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like', 'comment', 'reply', 'mention', 'follow', 'follow_request', 'follow_accept',
                  'message', 'review_request', 'review_answer'));

-- Could this person see the post? (owner, public account, or accepted follower)
create or replace function public.user_can_see_post(p_user uuid, p_post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from posts p join public_profiles a on a.id = p.user_id
    where p.id = p_post
      and (p.user_id = p_user or not a.is_private
           or exists (select 1 from follows f where f.follower = p_user and f.followee = p.user_id and f.status = 'accepted'))
  );
$$;
revoke all on function public.user_can_see_post(uuid, uuid) from public, anon, authenticated;

create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_parent_author uuid;
  v_done uuid[] := array[new.user_id];
  v_name text;
  v_user uuid;
begin
  select user_id into v_owner from posts where id = new.post_id;
  if v_owner is null then return new; end if;

  -- Reply: tell the author of the comment being answered.
  if new.parent_id is not null then
    select user_id into v_parent_author from post_comments where id = new.parent_id;
    if v_parent_author is not null and not v_parent_author = any(v_done)
       and not notify_blocked(v_parent_author, new.user_id) and wants_notification(v_parent_author, 'comment') then
      insert into notifications (user_id, actor_id, type, post_id, comment_id, body)
      values (v_parent_author, new.user_id, 'reply', new.post_id, new.id, left(new.body, 140));
    end if;
    if v_parent_author is not null then v_done := v_done || v_parent_author; end if;
  end if;

  -- The post's owner hears about every comment (unless already told above).
  if not v_owner = any(v_done) and not notify_blocked(v_owner, new.user_id) and wants_notification(v_owner, 'comment') then
    insert into notifications (user_id, actor_id, type, post_id, comment_id, body)
    values (v_owner, new.user_id, 'comment', new.post_id, new.id, left(new.body, 140));
  end if;
  v_done := v_done || v_owner;

  -- @mentions (up to 10 per comment).
  for v_name in
    select distinct lower(m[1]) from regexp_matches(new.body, '@([A-Za-z0-9_.]{3,24})', 'g') as m limit 10
  loop
    select id into v_user from public_profiles where username = v_name;
    if v_user is null or v_user = any(v_done) then continue; end if;
    v_done := v_done || v_user;
    if notify_blocked(v_user, new.user_id) or not wants_notification(v_user, 'comment')
       or not user_can_see_post(v_user, new.post_id) then continue; end if;
    insert into notifications (user_id, actor_id, type, post_id, comment_id, body)
    values (v_user, new.user_id, 'mention', new.post_id, new.id, left(new.body, 140));
  end loop;
  return new;
end;
$$;
