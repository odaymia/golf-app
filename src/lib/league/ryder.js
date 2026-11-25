import { MATCH_FORMATS } from './event.js';

// Ryder Cup helpers: foursomes from matches, and checking scorekeepers'
// cards against each other. Pure, no network.

// Foursomes for a round's matches, in match order:
//   2 vs 2 match: the four players are one foursome.
//   1 vs 1 matches: matches 1 and 2 share a foursome, then 3 and 4, and so
//   on (an odd last singles match plays as a twosome).
//   Split-round matches (same `set`) are one foursome.
export function foursomesForMatches(matchups) {
  const groups = [];
  let pendingSingles = null;
  const sets = new Map();
  for (const mu of matchups) {
    const players = mu.sides.flat();
    if (mu.set != null) {
      if (!sets.has(mu.set)) {
        sets.set(mu.set, []);
        groups.push(sets.get(mu.set));
      }
      const g = sets.get(mu.set);
      for (const id of players) if (!g.includes(id)) g.push(id);
      continue;
    }
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

// Players per side for a format: one-ball and best-ball formats are 2 vs 2
// (a split round is set up pair vs pair).
export const sideSize = (format) => (format === 'singles' ? 1 : 2);

// Split round: one foursome plays different formats over different holes,
// each stretch its own match and point. Saved as the round's format text:
//   "split:1-6:scramble|7-12:fourball|13-18:singles"
// A stretch worth more than 1 point adds it: "13-18:singles:2".
export const isSplit = (format) => typeof format === 'string' && format.startsWith('split');

export function defaultSplit(n = 18) {
  if (n < 3) return [{ from: 1, to: n, format: 'fourball' }];
  const a = Math.round(n / 3);
  const b = Math.round((2 * n) / 3);
  return [
    { from: 1, to: a, format: 'scramble' },
    { from: a + 1, to: b, format: 'fourball' },
    { from: b + 1, to: n, format: 'singles' },
  ];
}

export function parseSplit(text, n = 18) {
  if (!isSplit(text)) return null;
  const segs = text
    .slice('split:'.length)
    .split('|')
    .map((part) => {
      const [range, format, pts] = part.split(':');
      const [from, to] = range.split('-').map(Number);
      return { from, to, format, points: Number(pts) > 0 ? Number(pts) : 1 };
    })
    .filter((x) => Number.isInteger(x.from) && Number.isInteger(x.to) && x.format);
  return segs.length ? segs : defaultSplit(n);
}

// A round's format in words; split rounds list their stretches.
export const roundFormatText = (format, n = 18) =>
  isSplit(format)
    ? parseSplit(format, n)
        .map((x) => `${x.from}–${x.to} ${MATCH_FORMATS[x.format]?.short ?? x.format}${x.points > 1 ? ` (${x.points} pts)` : ''}`)
        .join(' · ')
    : (MATCH_FORMATS[format]?.short ?? '');

// A match's format label, with its holes when it covers only some.
export const matchLabel = (m, long = false) => {
  const f = MATCH_FORMATS[m.format];
  const word = long ? f?.label : f?.short;
  return m.range ? `Holes ${m.range[0] + 1}–${m.range[1] + 1} · ${f?.short}` : word;
};

export const splitText = (segs) =>
  `split:${segs.map((x) => `${x.from}-${x.to}:${x.format}${x.points > 1 ? `:${x.points}` : ''}`).join('|')}`;

// Points per match for a whole (not split) round ride on its format text:
// "fourball@2". Split rounds keep points per stretch instead.
export function formatPoints(text) {
  if (typeof text !== 'string' || isSplit(text) || !text.includes('@')) return { format: text ?? null, points: 1 };
  const [format, p] = text.split('@');
  return { format, points: Number(p) > 0 ? Number(p) : 1 };
}
export const formatWithPoints = (format, points) => (format && !isSplit(format) && points > 1 ? `${format}@${points}` : format);

// Problems with a plan, or null: stretches in order, no gaps or overlaps,
// covering holes 1..n.
export function splitProblem(segs, n = 18) {
  if (segs.length < 2) return 'Add at least two stretches of holes.';
  let next = 1;
  for (const x of segs) {
    if (x.from !== next) return `Holes must follow on: the next stretch should start on hole ${next}.`;
    if (x.to < x.from) return `Holes ${x.from}–${x.to} run backwards.`;
    next = x.to + 1;
  }
  if (next !== n + 1) return `The stretches must end on hole ${n}.`;
  return null;
}

// One foursome's matches for a split round. a, b: the two pairs ([p1, p2]).
// Singles stretches pair first vs first and second vs second.
export function splitMatchups(a, b, segs, set) {
  return segs.flatMap((x) =>
    x.format === 'singles'
      ? [0, 1].map((k) => ({ sides: [[a[k]], [b[k]]], format: 'singles', holes: [x.from, x.to], set, points: x.points ?? 1 }))
      : [{ sides: [a, b], format: x.format, holes: [x.from, x.to], set, points: x.points ?? 1 }],
  );
}

// A split round's stretches changed: rebuild each foursome's matches with
// the same two pairs (scores are per player per hole, so none are lost).
// Keeps who plays whom in singles (after a swap) when the old plan had
// singles. Matches that aren't part of a foursome set are dropped.
export function resplitMatchups(matchups, segs) {
  const sets = [...new Set(matchups.filter((mu) => mu.set != null).map((mu) => mu.set))];
  return sets.flatMap((set) => {
    const mine = matchups.filter((mu) => mu.set === set);
    const singles = mine.filter((mu) => mu.sides[0].length === 1).slice(0, 2);
    const team = mine.find((mu) => mu.sides[0].length === 2);
    let a;
    let b;
    if (singles.length === 2) {
      a = singles.map((mu) => mu.sides[0][0]);
      b = singles.map((mu) => mu.sides[1][0]);
    } else if (team) {
      [a, b] = team.sides;
    } else return [];
    return splitMatchups(a, b, segs, set);
  });
}

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
