-- Clear a hole: wipes one hole's score for some players in a league /
-- tournament round, on the official card AND every scorekeeper's own card
-- (score_entries), so a score typed by mistake really goes away.
-- Paste into Supabase: SQL Editor -> New query -> Run. Safe to run again.
--
-- Same rules as entering scores: you must be allowed to score each player
-- (public.can_score) and the round must not be final (commissioners may).
-- p_hole is 1-based (hole 18 = 18).

create or replace function public.clear_hole(p_event uuid, p_members uuid[], p_hole int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  ev league_events;
  m uuid;
begin
  select * into ev from league_events where id = p_event;
  if ev.id is null then raise exception 'Round not found'; end if;
  if ev.status = 'final' and not public.is_league_admin(ev.league_id) then
    raise exception 'This round is final';
  end if;
  if p_hole is null or p_hole < 1 then raise exception 'Bad hole'; end if;
  foreach m in array coalesce(p_members, '{}') loop
    if not public.can_score(p_event, m) then
      raise exception 'You can''t score for that player';
    end if;
    update event_scores set gross[p_hole] = null, updated_at = now()
      where event_id = p_event and member_id = m and array_length(gross, 1) >= p_hole;
    update score_entries set gross = jsonb_set(gross, array[(p_hole - 1)::text], 'null'::jsonb), updated_at = now()
      where event_id = p_event and member_id = m and jsonb_array_length(gross) >= p_hole;
  end loop;
end $$;

revoke all on function public.clear_hole(uuid, uuid[], int) from public, anon;
grant execute on function public.clear_hole(uuid, uuid[], int) to authenticated;
