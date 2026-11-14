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
