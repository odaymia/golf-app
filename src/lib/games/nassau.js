import { holeResults, describeMatch, sideLabel } from './match.js';
import { emptyBalances, payTeamBet } from './money.js';

// Nassau: three match-play bets (front 9, back 9, overall 18) with presses.
//
// game = {
//   net,
//   stakes: { front, back, overall },   // cents per player
//   autoPress: 2,                       // 0 = off; new press when the latest
//                                       //   bet in a nine goes N down
//   pressOverall: false,                // auto-press the 18-hole bet too
//   matchups: [[sideA, sideB], ...],
//   presses: [{ matchup, segment, hole }]  // manual presses; hole is 1-based
// }
//
// A press is a new bet worth the same stake, starting on `hole` and ending
// with its nine (or hole 18 for the overall). Auto-presses start on the hole
// after the latest bet goes N down, as long as that hole is in the same nine.

export const SEGMENTS = [
  { key: 'front', label: 'Front', from: 0, to: 8 },
  { key: 'back', label: 'Back', from: 9, to: 17 },
  { key: 'overall', label: 'Overall', from: 0, to: 17 },
];

function playSegment(results, seg, { autoPress, manualStarts }) {
  // bets: { start (0-based), up, played, auto, manual }
  const bets = [{ start: seg.from, up: 0, played: 0, auto: false, manual: false }];
  const pending = manualStarts.filter((s) => s > seg.from && s <= seg.to).sort((a, b) => a - b);
  let thru = 0;
  for (let h = seg.from; h <= seg.to; h++) {
    while (pending.length && pending[0] === h) {
      pending.shift();
      bets.push({ start: h, up: 0, played: 0, auto: false, manual: true });
    }
    const r = results[h];
    if (r == null) break;
    thru = h - seg.from + 1;
    for (const bet of bets) {
      bet.up += r;
      bet.played++;
    }
    const latest = bets[bets.length - 1];
    if (autoPress > 0 && Math.abs(latest.up) >= autoPress && h < seg.to) {
      bets.push({ start: h + 1, up: 0, played: 0, auto: true, manual: false });
    }
  }
  const length = seg.to - seg.from + 1;
  return {
    thru,
    bets: bets.map((b) => {
      const total = seg.to - b.start + 1;
      const status = {
        up: b.up,
        played: b.played,
        remaining: total - b.played,
        closedOut: Math.abs(b.up) > total - b.played,
        complete: Math.abs(b.up) > total - b.played || b.played === total,
        winner: b.up > 0 ? 0 : b.up < 0 ? 1 : null,
      };
      return { ...b, hole: b.start + 1, status, text: describeMatch(status) };
    }),
    complete: thru === length,
  };
}

export function scoreNassau(ctx, game) {
  if (ctx.holes.length !== 18) throw new Error('Nassau needs 18 holes');
  const balances = emptyBalances(ctx.players.map((p) => p.id));
  const presses = game.presses ?? [];
  const matchups = game.matchups.map(([a, b], mi) => {
    const results = holeResults(ctx, a, b, game.net);
    const segments = SEGMENTS.map((seg) => {
      const auto = seg.key === 'overall' && !game.pressOverall ? 0 : game.autoPress ?? 0;
      const manualStarts = presses
        .filter((p) => p.matchup === mi && p.segment === seg.key)
        .map((p) => p.hole - 1);
      const played = playSegment(results, seg, { autoPress: auto, manualStarts });
      const stake = game.stakes[seg.key];
      for (const bet of played.bets) {
        if (bet.status.winner === 0) payTeamBet(balances, a, b, stake);
        if (bet.status.winner === 1) payTeamBet(balances, b, a, stake);
      }
      return { key: seg.key, label: seg.label, stake, ...played };
    });
    return { sides: [a, b], label: `${sideLabel(ctx, a)} vs ${sideLabel(ctx, b)}`, segments };
  });
  return { balances, matchups };
}

// Which nine a press made before playing `hole` (1-based) belongs to.
export function segmentForHole(hole) {
  return hole <= 9 ? 'front' : 'back';
}
