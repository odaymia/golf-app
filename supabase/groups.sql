-- Groups (foursomes) and who may enter scores.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
--
-- A player may enter scores only for people in their own group for that
-- round: the round's groups, or their match if no group includes them.
-- Commissioners may enter scores for anyone. Everyone can still read
-- every score in their league.

alter table public.league_events
  add column if not exists groups jsonb not null default '[]'::jsonb;

-- groups: [[memberId, ...], ...]   matchups: [{ sides: [[ids], [ids]], ... }]
create or replace function public.can_score(p_event uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from league_events e
    join league_members me on me.league_id = e.league_id and me.user_id = auth.uid()
    where e.id = p_event
      and (
        me.role = 'commissioner'
        or me.id = p_member
        or exists (
          select 1 from jsonb_array_elements(e.groups) g
          where g ? me.id::text and g ? p_member::text
        )
        or (
          not exists (select 1 from jsonb_array_elements(e.groups) g where g ? me.id::text)
          and exists (
            select 1 from jsonb_array_elements(e.matchups) mu
            where ((mu -> 'sides' -> 0) ? me.id::text or (mu -> 'sides' -> 1) ? me.id::text)
              and ((mu -> 'sides' -> 0) ? p_member::text or (mu -> 'sides' -> 1) ? p_member::text)
          )
        )
      )
  );
$$;

revoke all on function public.can_score(uuid, uuid) from public, anon;
grant execute on function public.can_score(uuid, uuid) to authenticated;

drop policy if exists "members add scores" on public.event_scores;
drop policy if exists "members edit scores" on public.event_scores;
create policy "members add scores" on public.event_scores for insert to authenticated
  with check (
    public.can_score(event_id, member_id)
    and exists (select 1 from league_events e where e.id = event_id and e.league_id = event_scores.league_id
                and (e.status = 'scheduled' or public.is_league_admin(e.league_id)))
    and exists (select 1 from league_members m where m.id = member_id and m.league_id = event_scores.league_id)
  );
create policy "members edit scores" on public.event_scores for update to authenticated
  using (public.can_score(event_id, member_id))
  with check (
    public.can_score(event_id, member_id)
    and exists (select 1 from league_events e where e.id = event_id and e.league_id = event_scores.league_id
                and (e.status = 'scheduled' or public.is_league_admin(e.league_id)))
    and exists (select 1 from league_members m where m.id = member_id and m.league_id = event_scores.league_id)
  );
