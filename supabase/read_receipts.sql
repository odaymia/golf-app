-- Read receipts setting for direct messages.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
-- Needs saves_messages.sql and privacy.sql first.
--
-- Like Instagram: turning yours off means others don't see when you've read
-- their messages, and you don't see theirs. To make that real (not just
-- hidden in the app), members can no longer read last_read_at directly; the
-- app gets read times from conversation_read_times(), which returns the
-- other person's read time only when both people have receipts on.

alter table public.privacy_settings add column if not exists read_receipts boolean not null default true;

-- Members still see who is in a conversation, but not read times.
revoke select on public.conversation_members from authenticated;
grant select (conversation_id, user_id) on public.conversation_members to authenticated;

create or replace function public.receipts_on(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select read_receipts from privacy_settings where user_id = p_user), true);
$$;
revoke all on function public.receipts_on(uuid) from public, anon, authenticated;

-- For each of my conversations: when I last read it (for unread dots) and
-- when the other person did (only if we both have read receipts on).
create or replace function public.conversation_read_times(p_ids uuid[])
returns table (conversation_id uuid, my_read_at timestamptz, peer_read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.conversation_id,
         m.last_read_at,
         case when public.receipts_on(auth.uid()) and public.receipts_on(o.user_id) then o.last_read_at end
  from conversation_members m
  left join lateral (
    select x.user_id, x.last_read_at from conversation_members x
    where x.conversation_id = m.conversation_id and x.user_id <> m.user_id
    limit 1
  ) o on true
  where m.user_id = auth.uid() and m.conversation_id = any(p_ids);
$$;
revoke all on function public.conversation_read_times(uuid[]) from public, anon;
grant execute on function public.conversation_read_times(uuid[]) to authenticated;
