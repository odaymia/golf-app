import { bestBall, holeCount } from './scores.js';
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
// game = { net, stake (cents), matchups: [[sideA, sideB], ...] }
// Each matchup is worth `stake` per player to the side that's ahead.
// Balances show where the money stands if the round ended now.
export function scoreMatchPlay(ctx, game) {
  const balances = emptyBalances(ctx.players.map((p) => p.id));
  const matchups = game.matchups.map(([a, b]) => {
    const results = holeResults(ctx, a, b, game.net);
    const status = matchStatus(results, 0, holeCount(ctx) - 1, { stopAtCloseout: true });
    if (status.winner === 0) payTeamBet(balances, a, b, game.stake);
    if (status.winner === 1) payTeamBet(balances, b, a, game.stake);
    let up = 0;
    return {
      sides: [a, b],
      label: `${sideLabel(ctx, a)} vs ${sideLabel(ctx, b)}`,
      status,
      results,
      running: results.map((r, h) => (h >= status.played || r == null ? null : (up += r))),
      sideScores: [a, b].map((side) => ctx.holes.map((_, h) => bestBall(ctx, side, h, game.net))),
      text: describeMatch(status),
    };
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
