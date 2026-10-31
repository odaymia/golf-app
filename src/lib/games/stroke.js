import { scoreFor, holeCount } from './scores.js';
import { emptyBalances } from './money.js';

// Stroke play: everyone plays everyone, head to head.
// game = { net, mode: 'perOpponent' | 'perStroke', stake (cents) }
//   perOpponent: lower total collects `stake` from each player they beat.
//   perStroke:   pay `stake` for every stroke you lose by.
// Each pair is compared only on holes both players have scored.
export function scoreStrokePlay(ctx, game) {
  const ids = ctx.players.map((p) => p.id);
  const balances = emptyBalances(ids);
  const totals = {};
  const thru = {};
  for (const id of ids) {
    totals[id] = 0;
    thru[id] = 0;
    for (let h = 0; h < holeCount(ctx); h++) {
      const s = scoreFor(ctx, id, h, game.net);
      if (s != null) {
        totals[id] += s;
        thru[id]++;
      }
    }
  }

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      let diff = 0; // positive = a shot more strokes (a is losing)
      for (let h = 0; h < holeCount(ctx); h++) {
        const sa = scoreFor(ctx, a, h, game.net);
        const sb = scoreFor(ctx, b, h, game.net);
        if (sa != null && sb != null) diff += sa - sb;
      }
      if (diff === 0) continue;
      const amount = game.mode === 'perStroke' ? Math.abs(diff) * game.stake : game.stake;
      const [winner, loser] = diff < 0 ? [a, b] : [b, a];
      balances[winner] += amount;
      balances[loser] -= amount;
    }
  }

  const standings = ids
    .map((id) => ({ id, total: totals[id], thru: thru[id] }))
    .sort((x, y) => x.total - y.total);
  return { balances, standings };
}
