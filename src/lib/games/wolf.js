import { bestBall, holeCount } from './scores.js';
import { emptyBalances, payTeamBet } from './money.js';

// Wolf (4 players). The wolf rotates in `order`: hole 1 is order[0],
// hole 2 order[1], ... hole 5 order[0] again.
//
// Each hole the wolf either picks a partner (2 vs 2), goes lone wolf
// (1 vs 3, after seeing tee shots) or blind wolf (1 vs 3, declared before
// anyone tees off). Low best ball wins the hole; ties push.
//
// game = {
//   net, stake (cents),
//   loneMult: 2, blindMult: 3,
//   order: [id, id, id, id],
//   decisions: { [hole 1-based]: { partner: id } | { lone: true } | { blind: true } }
// }
//
// Money per hole:
//   2 vs 2:      each winner collects `stake` from a loser.
//   lone/blind:  the wolf wins or loses stake x multiplier with EACH of the
//                other three players.
export function wolfForHole(order, hole) {
  return order[(hole - 1) % order.length];
}

export function scoreWolf(ctx, game) {
  const ids = ctx.players.map((p) => p.id);
  if (game.order.length !== 4) throw new Error('Wolf needs exactly 4 players');
  const balances = emptyBalances(ids);
  const holes = [];

  for (let h = 0; h < holeCount(ctx); h++) {
    const hole = h + 1;
    const wolf = wolfForHole(game.order, hole);
    const decision = game.decisions?.[hole];
    if (!decision) {
      holes.push({ hole, wolf, result: 'no pick' });
      continue;
    }
    let wolfTeam;
    let mult = 1;
    if (decision.partner) {
      wolfTeam = [wolf, decision.partner];
    } else {
      wolfTeam = [wolf];
      mult = decision.blind ? game.blindMult ?? 3 : game.loneMult ?? 2;
    }
    const others = game.order.filter((id) => !wolfTeam.includes(id));
    const a = bestBall(ctx, wolfTeam, h, game.net);
    const b = bestBall(ctx, others, h, game.net);
    if (a == null || b == null) {
      holes.push({ hole, wolf, decision, result: 'not scored' });
      continue;
    }
    const kind = decision.partner ? 'partner' : decision.blind ? 'blind' : 'lone';
    if (a === b) {
      holes.push({ hole, wolf, decision, kind, result: 'push', amount: 0 });
      continue;
    }
    const wolfWon = a < b;
    const amount = game.stake * mult;
    if (wolfTeam.length === 2) {
      if (wolfWon) payTeamBet(balances, wolfTeam, others, amount);
      else payTeamBet(balances, others, wolfTeam, amount);
    } else {
      for (const id of others) {
        if (wolfWon) {
          balances[wolf] += amount;
          balances[id] -= amount;
        } else {
          balances[wolf] -= amount;
          balances[id] += amount;
        }
      }
    }
    holes.push({ hole, wolf, decision, kind, result: wolfWon ? 'wolf won' : 'wolf lost', amount });
  }
  return { balances, holes };
}
