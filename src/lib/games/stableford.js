import { payByPlace } from './places.js';
import { scoreFor, grossScore, holeCount } from './scores.js';
import { emptyBalances, payTeamBet } from './money.js';

// Stableford scoring rules, shared by casual rounds and leagues.
//
// scoring = {
//   preset: 'standard' | 'modified' | 'custom',
//   points: { albatross, eagle, birdie, par, bogey, double },  // per result
//   bonusOn: false,
//   bonus: { ace, albatross, eagle, birdie },  // natural (gross) scores
// }

export const STABLEFORD_RESULTS = [
  ['albatross', 'Albatross or better'],
  ['eagle', 'Eagle'],
  ['birdie', 'Birdie'],
  ['par', 'Par'],
  ['bogey', 'Bogey'],
  ['double', 'Double bogey or worse'],
];

export const STABLEFORD_PRESETS = {
  standard: {
    label: 'Standard',
    help: 'The classic: par 2, birdie 3, eagle 4. A blow-up hole is just 0.',
    points: { albatross: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, double: 0 },
  },
  modified: {
    label: 'Modified',
    help: 'The PGA Tour version: rewards going low and costs you for bogeys.',
    points: { albatross: 8, eagle: 5, birdie: 2, par: 0, bogey: -1, double: -3 },
  },
  custom: { label: 'Custom', help: 'Set your own points for every result.' },
};

// Extra points for a natural (gross, no handicap strokes) score, on top of
// the Stableford points. An ace earns the ace bonus instead of eagle/albatross.
export const BONUS_RESULTS = [
  ['ace', 'Hole-in-one'],
  ['albatross', 'Natural albatross'],
  ['eagle', 'Natural eagle'],
  ['birdie', 'Natural birdie'],
];

export function defaultStablefordScoring() {
  return {
    preset: 'standard',
    points: { ...STABLEFORD_PRESETS.standard.points },
    bonusOn: false,
    bonus: { ace: 5, albatross: 3, eagle: 2, birdie: 1 },
  };
}

// Fill defaults; a preset always uses its own points.
export function normalizeScoring(scoring) {
  const sc = { ...defaultStablefordScoring(), ...(scoring ?? {}) };
  if (sc.preset !== 'custom') sc.points = { ...STABLEFORD_PRESETS[sc.preset ?? 'standard'].points };
  return sc;
}

export function stablefordPoints(score, par, table = STABLEFORD_PRESETS.standard.points) {
  const d = score - par;
  if (d <= -3) return table.albatross;
  if (d === -2) return table.eagle;
  if (d === -1) return table.birdie;
  if (d === 0) return table.par;
  if (d === 1) return table.bogey;
  return table.double;
}

// Bonus for a natural (gross) score, no handicap strokes involved.
export function naturalBonus(gross, par, bonus) {
  if (gross === 1) return bonus.ace ?? 0;
  const d = gross - par;
  if (d <= -3) return bonus.albatross ?? 0;
  if (d === -2) return bonus.eagle ?? 0;
  if (d === -1) return bonus.birdie ?? 0;
  return 0;
}

// One player's points on a hole, bonus included. `score` is net or gross
// per the game; the bonus always looks at the gross score.
export function holePoints(scoring, score, gross, par) {
  const pts = stablefordPoints(score, par, scoring.points ?? STABLEFORD_PRESETS.standard.points);
  return pts + (scoring.bonusOn ? naturalBonus(gross, par, scoring.bonus ?? {}) : 0);
}

// Stableford game for a casual round.
//
// game = {
//   net, stake (cents), scoring,
//   mode: 'perPoint' | 'perOpponent',
//     perPoint:    pay `stake` for every point you finish behind
//     perOpponent: more points collects `stake` (ties push)
//   teams: null | [[a, b], [c, d]],   // team Stableford (2 vs 2)
//   teamScore: 'bestBall' | 'aggregate',
// }
// Individual: everyone plays everyone. Teams: one bet, each player on the
// winning team collects from one on the losing team. A hole counts once
// everyone involved has a score, so the money is fair mid-round.
export function scoreStableford(ctx, game) {
  const ids = ctx.players.map((p) => p.id);
  const scoring = normalizeScoring(game.scoring);
  const balances = emptyBalances(ids);
  const n = holeCount(ctx);
  const pointsOn = (id, h) => {
    const s = scoreFor(ctx, id, h, game.net);
    if (s == null) return null;
    return holePoints(scoring, s, grossScore(ctx, id, h), ctx.holes[h].par);
  };
  const pay = (diff, winners, losers) => {
    if (diff === 0) return;
    const amount = game.mode === 'perOpponent' ? game.stake : Math.abs(diff) * game.stake;
    payTeamBet(balances, winners, losers, amount);
  };

  if (game.teams) {
    const totals = game.teams.map(() => 0);
    let thru = 0;
    for (let h = 0; h < n; h++) {
      const pts = game.teams.map((team) => team.map((id) => pointsOn(id, h)));
      if (pts.flat().some((p) => p == null)) continue;
      thru++;
      pts.forEach((teamPts, t) => {
        totals[t] += game.teamScore === 'aggregate' ? teamPts.reduce((a, b) => a + b, 0) : Math.max(...teamPts);
      });
    }
    const diff = totals[0] - totals[1];
    if (diff > 0) pay(diff, game.teams[0], game.teams[1]);
    if (diff < 0) pay(diff, game.teams[1], game.teams[0]);
    return { balances, teamTotals: totals, thru };
  }

  if (game.mode === 'places') {
    // Most points wins; `stake` is each player's entry (games/places.js).
    return payByPlace({ ids, n, valueOn: pointsOn, lowerWins: false, entry: game.stake, places: game.places ?? [50, 30, 20] });
  }
  const totals = {};
  const thru = {};
  for (const id of ids) {
    totals[id] = 0;
    thru[id] = 0;
    for (let h = 0; h < n; h++) {
      const p = pointsOn(id, h);
      if (p != null) {
        totals[id] += p;
        thru[id]++;
      }
    }
  }
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i], ids[j]];
      let diff = 0; // positive = a ahead
      for (let h = 0; h < n; h++) {
        const pa = pointsOn(a, h);
        const pb = pointsOn(b, h);
        if (pa != null && pb != null) diff += pa - pb;
      }
      if (diff > 0) pay(diff, [a], [b]);
      if (diff < 0) pay(diff, [b], [a]);
    }
  }
  const standings = ids.map((id) => ({ id, total: totals[id], thru: thru[id] })).sort((x, y) => y.total - x.total);
  return { balances, standings };
}
