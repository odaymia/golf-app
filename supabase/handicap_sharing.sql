-- Share your handicap index with other golfers (for adding friends to a
-- round). Paste into Supabase: SQL Editor -> New query -> Run. Safe to run
-- again. Needs schema.sql, account_safety.sql and privacy.sql first.
--
-- profiles (handicap index, GHIN number) stays private. This function hands
-- out only the index, only for golfers who share it (on by default), and
-- never between blocked people. GHIN numbers are never shared.

alter table public.privacy_settings add column if not exists share_handicap boolean not null default true;

create or replace function public.handicap_indexes(p_users uuid[])
returns table (user_id uuid, handicap_index numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.handicap_index
  from profiles p
  where p.id = any(p_users)
    and auth.uid() is not null
    and (
      p.id = auth.uid()
      or (
        coalesce((select s.share_handicap from privacy_settings s where s.user_id = p.id), true)
        and not exists (
          select 1 from blocks b
          where (b.blocker = auth.uid() and b.blocked = p.id) or (b.blocker = p.id and b.blocked = auth.uid())
        )
      )
    );
$$;
revoke all on function public.handicap_indexes(uuid[]) from public, anon;
grant execute on function public.handicap_indexes(uuid[]) to authenticated;
