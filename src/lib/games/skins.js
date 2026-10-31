import { scoreFor, holeCount } from './scores.js';
import { emptyBalances, splitByWeight } from './money.js';

// Skins: the lone low score on a hole wins the skin.
//
// game = {
//   net,
//   carryover: true,    // tied holes push their skin to the next hole
//   validate: false,    // a skin winner must tie or win the next hole to
//                       //   keep it; otherwise the skin(s) carry over.
//                       //   A skin won on the last hole needs no validation.
//   mode: 'perSkin' | 'pot',
//   stake,              // perSkin: cents each other player pays per skin
//   buyIn,              // pot: cents each player puts in; pot split by skins
// }
//
// Skins still tied after the last hole are not won by anyone.
export function scoreSkins(ctx, game) {
  const ids = ctx.players.map((p) => p.id);
  const n = holeCount(ctx);
  const won = Object.fromEntries(ids.map((id) => [id, 0]));
  const holes = []; // per hole: { winner, value, carried, status }
  let carry = 0;
  let pendingWinner = null; // awaiting validation
  let pendingValue = 0;
  let thru = 0;

  for (let h = 0; h < n; h++) {
    const scores = ids.map((id) => scoreFor(ctx, id, h, game.net));
    if (scores.some((s) => s == null)) break;
    thru = h + 1;
    const low = Math.min(...scores);
    const lowIds = ids.filter((_, i) => scores[i] === low);

    if (pendingWinner != null) {
      if (lowIds.includes(pendingWinner)) {
        won[pendingWinner] += pendingValue;
        holes[h - 1].status = 'validated';
      } else {
        carry += pendingValue;
        holes[h - 1].status = 'not validated';
      }
      pendingWinner = null;
      pendingValue = 0;
    }

    const value = 1 + carry;
    if (lowIds.length === 1) {
      const winner = lowIds[0];
      carry = 0;
      if (game.validate && h < n - 1) {
        pendingWinner = winner;
        pendingValue = value;
        holes.push({ hole: h + 1, winner, value, status: 'needs validation' });
      } else {
        won[winner] += value;
        holes.push({ hole: h + 1, winner, value, status: 'won' });
      }
    } else {
      if (game.carryover) carry = value;
      else carry = 0;
      holes.push({ hole: h + 1, winner: null, value, status: game.carryover ? 'carried' : 'dead' });
    }
  }

  const balances = emptyBalances(ids);
  const totalSkins = ids.reduce((s, id) => s + won[id], 0);
  if (game.mode === 'pot') {
    if (totalSkins > 0) {
      const pot = game.buyIn * ids.length;
      const shares = splitByWeight(pot, ids, won);
      for (const id of ids) balances[id] = shares[id] - game.buyIn;
    }
  } else {
    for (const id of ids) {
      // Collect from each other player for my skins; pay each of theirs.
      balances[id] += won[id] * game.stake * (ids.length - 1);
      balances[id] -= (totalSkins - won[id]) * game.stake;
    }
  }

  return {
    balances,
    won,
    holes,
    thru,
    carry,
    pending: pendingWinner != null ? { winner: pendingWinner, value: pendingValue } : null,
  };
}
