// Ryder Cup helpers: foursomes from matches, and checking scorekeepers'
// cards against each other. Pure, no network.

// Foursomes for a round's matches, in match order:
//   2 vs 2 match: the four players are one foursome.
//   1 vs 1 matches: matches 1 and 2 share a foursome, then 3 and 4, and so
//   on (an odd last singles match plays as a twosome).
export function foursomesForMatches(matchups) {
  const groups = [];
  let pendingSingles = null;
  for (const mu of matchups) {
    const players = mu.sides.flat();
    if (mu.sides[0].length === 1 && mu.sides[1].length === 1) {
      if (pendingSingles) {
        groups.push([...pendingSingles, ...players]);
        pendingSingles = null;
      } else pendingSingles = players;
    } else {
      groups.push(players);
    }
  }
  if (pendingSingles) groups.push(pendingSingles);
  return groups;
}

// Players per side for a format: one-ball and best-ball formats are 2 vs 2.
export const sideSize = (format) => (format === 'singles' ? 1 : 2);

// Can these two sides make a match? Returns an error message or null.
// teamOf(memberId) -> side name; sides: [sideA, sideB]
export function matchProblem({ a, b, format, sides, teamOf, used }) {
  const n = sideSize(format);
  if (a.length !== n || b.length !== n) return n === 1 ? 'Pick one player from each team.' : 'Pick two players from each team.';
  if (a.some((id) => teamOf(id) !== sides[0]) || b.some((id) => teamOf(id) !== sides[1])) return 'Each side of a match must come from its own team.';
  const twice = [...a, ...b].find((id) => used.has(id));
  if (twice) return 'A player can only be in one match per round.';
  return null;
}

// Scorekeepers' cards compared hole by hole.
// entries: [{ memberId, scorerId, gross: [..] }] for one round.
// Returns { [memberId]: { [holeIndex]: [{ scorerId, value }] } } for holes
// where two or more scorekeepers entered different scores.
export function discrepancies(entries) {
  const byMember = {};
  for (const e of entries) (byMember[e.memberId] ??= []).push(e);
  const out = {};
  for (const [memberId, list] of Object.entries(byMember)) {
    if (list.length < 2) continue;
    const holes = Math.max(...list.map((e) => e.gross?.length ?? 0));
    for (let h = 0; h < holes; h++) {
      const vals = list.filter((e) => e.gross?.[h] != null).map((e) => ({ scorerId: e.scorerId, value: e.gross[h] }));
      if (new Set(vals.map((v) => v.value)).size > 1) {
        (out[memberId] ??= {})[h] = vals;
      }
    }
  }
  return out;
}

// Holes (0-based) with a discrepancy for any of these players.
export function discrepancyHoles(disc, memberIds) {
  const holes = new Set();
  for (const id of memberIds) for (const h of Object.keys(disc[id] ?? {})) holes.add(Number(h));
  return [...holes].sort((a, b) => a - b);
}

// What another scorekeeper entered for a player on a hole, if I haven't
// entered it myself (shown as a one-tap suggestion). null if nothing.
export function othersValue(entries, memberId, hole, myScorerId) {
  const vals = entries
    .filter((e) => e.memberId === memberId && e.scorerId !== myScorerId && e.gross?.[hole] != null)
    .map((e) => e.gross[hole]);
  if (!vals.length) return null;
  return new Set(vals).size === 1 ? vals[0] : null;
}
