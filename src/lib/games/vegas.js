import { scoreFor, holeCount } from './scores.js';
import { emptyBalances, payTeamBet } from './money.js';

// Vegas (2 vs 2). Each team puts its two scores together, low score first:
// a 4 and a 5 make 45. If either score is 10 or more, the high score goes
// first (4 and 10 make 104). Lower team number wins the difference in points.
//
// Flip the bird: when a team makes birdie or better, the OTHER team's number
// is flipped high-first (45 becomes 54). If both teams birdie, nobody flips.
//
// game = { net, stake (cents per point, per player), teams: [[a, b], [c, d]],
//          birdieFlip: true }
// Net scores below 1 count as 1 so numbers stay two digits.

export function teamNumber(s1, s2, flipped = false) {
  const lo = Math.min(s1, s2);
  const hi = Math.max(s1, s2);
  const highFirst = flipped || hi >= 10;
  return Number(highFirst ? `${hi}${lo}` : `${lo}${hi}`);
}

export function scoreVegas(ctx, game) {
  const ids = ctx.players.map((p) => p.id);
  const [teamA, teamB] = game.teams;
  if (teamA.length !== 2 || teamB.length !== 2) throw new Error('Vegas needs two teams of 2');
  const balances = emptyBalances(ids);
  const holes = [];
  let points = 0; // positive = team A ahead

  for (let h = 0; h < holeCount(ctx); h++) {
    const par = ctx.holes[h].par;
    const get = (id) => {
      const s = scoreFor(ctx, id, h, game.net);
      return s == null ? null : Math.max(1, s);
    };
    const a = teamA.map(get);
    const b = teamB.map(get);
    if ([...a, ...b].some((s) => s == null)) {
      holes.push({ hole: h + 1, result: 'not scored' });
      continue;
    }
    const aBirdie = Math.min(...a) < par;
    const bBirdie = Math.min(...b) < par;
    const flipA = game.birdieFlip && bBirdie && !aBirdie;
    const flipB = game.birdieFlip && aBirdie && !bBirdie;
    const numA = teamNumber(a[0], a[1], flipA);
    const numB = teamNumber(b[0], b[1], flipB);
    const diff = numB - numA;
    points += diff;
    holes.push({ hole: h + 1, numbers: [numA, numB], flipped: [flipA, flipB], points: diff });
  }

  if (points > 0) payTeamBet(balances, teamA, teamB, points * game.stake);
  if (points < 0) payTeamBet(balances, teamB, teamA, -points * game.stake);
  return { balances, holes, points };
}
