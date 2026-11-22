// Groups (foursomes) for a round, and who may enter whose scores.
// Mirrors public.can_score() in supabase/groups.sql: keep them in step.
//
// event.groups:   [[memberId, ...], ...]   set by the commissioner
// event.matchups: [{ sides: [[ids], [ids]] }]  a match is a group when no
//                 group includes the player

export function groupOf(event, memberId) {
  const groups = event.groups ?? [];
  const inGroups = groups.filter((g) => g.includes(memberId));
  if (inGroups.length) return [...new Set(inGroups.flat())];
  const matches = (event.matchups ?? []).filter((mu) => mu.sides.flat().includes(memberId));
  if (matches.length) return [...new Set(matches.flatMap((mu) => mu.sides.flat()))];
  return [memberId];
}

// me: { id, role } (my membership in this league), or undefined.
export function canScore(event, me, memberId) {
  if (!me) return false;
  if (me.role === 'commissioner') return true;
  return groupOf(event, me.id).includes(memberId);
}

// Split players into groups of `size` in order; the last groups are evened
// out (10 players -> 4, 3, 3 rather than 4, 4, 2).
export function autoGroups(ids, size = 4) {
  if (!ids.length) return [];
  const count = Math.ceil(ids.length / size);
  const base = Math.floor(ids.length / count);
  const extra = ids.length % count;
  const out = [];
  let i = 0;
  for (let g = 0; g < count; g++) {
    const n = base + (g < extra ? 1 : 0);
    out.push(ids.slice(i, i + n));
    i += n;
  }
  return out;
}

// The round a player should tap Play for: a round that isn't final and that
// they're in (their group or match; rounds with no groups or matches include
// everyone), today's first, else the latest one that has started.
// today: 'YYYY-MM-DD' (local). Returns the event or null.
export function roundToPlay(events, memberId, today) {
  if (!memberId) return null;
  const inRound = (e) => {
    const groups = e.groups ?? [];
    const matches = e.matchups ?? [];
    if (!groups.length && !matches.length) return true;
    return groups.some((g) => g.includes(memberId)) || matches.some((m) => m.sides.flat().includes(memberId));
  };
  const open = events.filter((e) => e.status !== 'final' && inRound(e));
  const todays = open.filter((e) => e.date === today);
  if (todays.length) return todays[0];
  const started = open.filter((e) => e.date && e.date < today).sort((a, b) => (a.date < b.date ? 1 : -1));
  return started[0] ?? null;
}
