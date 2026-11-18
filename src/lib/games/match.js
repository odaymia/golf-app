import { bestBall, holeCount, scoreFor } from './scores.js';
import { emptyBalances, payTeamBet } from './money.js';

// Per-hole result between two sides (each side = 1 or 2 players, best ball):
// 1 = side A won the hole, -1 = side B won, 0 = halved, null = not scored.
export function holeResults(ctx, sideA, sideB, useNet) {
  const results = [];
  for (let h = 0; h < holeCount(ctx); h++) {
    const a = bestBall(ctx, sideA, h, useNet);
    const b = bestBall(ctx, sideB, h, useNet);
    if (a == null || b == null) results.push(null);
    else results.push(a < b ? 1 : a > b ? -1 : 0);
  }
  return results;
}

// Status of a match over holes [from, to] (0-based, inclusive), counting
// holes in order and stopping at the first unscored one. With stopAtCloseout
// the match ends as soon as it's decided ("4 & 3"), like a real match.
export function matchStatus(results, from, to, { stopAtCloseout = false } = {}) {
  let up = 0;
  let played = 0;
  for (let h = from; h <= to; h++) {
    if (results[h] == null) break;
    up += results[h];
    played++;
    if (stopAtCloseout && Math.abs(up) > to - h) break;
  }
  const total = to - from + 1;
  const remaining = total - played;
  const closedOut = Math.abs(up) > remaining;
  return {
    up,
    played,
    remaining,
    closedOut,
    complete: closedOut || remaining === 0,
    winner: up > 0 ? 0 : up < 0 ? 1 : null,
  };
}

// "2 UP thru 7", "3 & 2", "All square", "1 DN"... from side A's view.
export function describeMatch(status) {
  const { up, played, remaining, closedOut } = status;
  if (played === 0) return 'Not started';
  if (closedOut && remaining > 0) return `${Math.abs(up)} & ${remaining}`;
  if (up === 0) return remaining === 0 ? 'Halved' : `All square thru ${played}`;
  const word = up > 0 ? 'UP' : 'DN';
  if (remaining === 0) return `${Math.abs(up)} ${word} (final)`;
  if (Math.abs(up) === remaining) return `${Math.abs(up)} ${word} (dormie)`;
  return `${Math.abs(up)} ${word} thru ${played}`;
}

function sideLabel(ctx, side) {
  const names = Object.fromEntries(ctx.players.map((p) => [p.id, p.name]));
  return side.map((id) => names[id] ?? id).join(' & ');
}

// Match play game.
// game = { net, stake (cents), matchups: [[sideA, sideB], ...], segments? }
// Each matchup is worth `stake` per player to the side that's ahead.
// Balances show where the money stands if the round ended now.
//
// Split match (2 vs 2 only): `segments: [{ from, to, format }]` (1-based,
// inclusive) plays different formats over different holes, each its own
// bet worth `stake`: 'fourball' (best ball), 'shamble' (both balls added)
// or 'singles' (two bets: first vs first, second vs second).
export function scoreMatchPlay(ctx, game) {
  const balances = emptyBalances(ctx.players.map((p) => p.id));
  const n = holeCount(ctx);
  const one = (a, b, seg) => {
    const from = seg ? seg.from - 1 : 0;
    const to = seg ? seg.to - 1 : n - 1;
    const combined = seg?.format === 'shamble';
    const sideScore = (side, h) => {
      if (!combined) return bestBall(ctx, side, h, game.net);
      let t = 0;
      for (const id of side) {
        const x = scoreFor(ctx, id, h, game.net);
        if (x == null) return null;
        t += x;
      }
      return t;
    };
    const sideScores = [a, b].map((side) => ctx.holes.map((_, h) => sideScore(side, h)));
    const results = ctx.holes.map((_, h) => {
      if (h < from || h > to) return null;
      const [x, y] = [sideScores[0][h], sideScores[1][h]];
      if (x == null || y == null) return null;
      return x < y ? 1 : x > y ? -1 : 0;
    });
    const status = matchStatus(results, from, to, { stopAtCloseout: true });
    // As if the round ended now: whoever is ahead collects.
    if (status.winner === 0) payTeamBet(balances, a, b, game.stake);
    if (status.winner === 1) payTeamBet(balances, b, a, game.stake);
    let up = 0;
    return {
      sides: [a, b],
      label: `${sideLabel(ctx, a)} vs ${sideLabel(ctx, b)}`,
      status,
      results,
      running: results.map((r, h) => (h < from || h >= from + status.played || r == null ? null : (up += r))),
      sideScores,
      text: describeMatch(status),
      format: seg?.format ?? (a.length === 1 ? 'singles' : 'fourball'),
      ...(seg ? { range: [from, to] } : {}),
    };
  };
  const matchups = game.matchups.flatMap(([a, b]) => {
    const segs = game.segments?.length && a.length === 2 && b.length === 2 ? game.segments : null;
    if (!segs) return [one(a, b, null)];
    return segs.flatMap((seg) =>
      seg.format === 'singles' ? [one([a[0]], [b[0]], seg), one([a[1]], [b[1]], seg)] : [one(a, b, seg)],
    );
  });
  return { balances, matchups };
}

// Scoreboard-style summary of a match for live display.
// leader: 0 (side A), 1 (side B) or null. big: "3 UP", "ALL SQUARE",
// "4 & 3", "HALVED". small: "thru 7", "dormie", "final", "not started".
export function matchSummary(status) {
  const { up, played, remaining, closedOut, complete } = status;
  const leader = up > 0 ? 0 : up < 0 ? 1 : null;
  const n = Math.abs(up);
  if (played === 0) return { leader: null, big: 'ALL SQUARE', small: 'not started' };
  if (closedOut && remaining > 0) return { leader, big: `${n} & ${remaining}`, small: 'final' };
  if (complete) return up === 0 ? { leader: null, big: 'HALVED', small: 'final' } : { leader, big: `${n} UP`, small: 'final' };
  if (up === 0) return { leader: null, big: 'ALL SQUARE', small: `thru ${played}` };
  if (n === remaining) return { leader, big: `${n} UP`, small: `dormie · thru ${played}` };
  return { leader, big: `${n} UP`, small: `thru ${played}` };
}

export { sideLabel };
