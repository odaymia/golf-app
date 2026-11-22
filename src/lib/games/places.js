import { scoreFor, holeCount } from './scores.js';
import { computePayoutsCents } from '../league/payouts.js';

// Payouts by place: everyone puts in the entry, the purse is paid to 1st,
// 2nd, 3rd... by a percent per place (ties share the places they cover, to
// the cent; see league/payouts.js).
// game = { net, entry (cents per player), places: [percent, ...] }
// Ranked by total score, lowest first, on the holes every player has
// finished, so a round in progress compares like with like. Balances are
// winnings minus entry, so they always net to zero.
export function scorePlaces(ctx, game) {
  const ids = ctx.players.map((p) => p.id);
  const counted = [];
  for (let h = 0; h < holeCount(ctx); h++) {
    if (ids.every((id) => scoreFor(ctx, id, h, game.net) != null)) counted.push(h);
  }
  const totals = Object.fromEntries(ids.map((id) => [id, counted.reduce((t, h) => t + scoreFor(ctx, id, h, game.net), 0)]));
  const order = [...ids].sort((a, b) => totals[a] - totals[b]);
  const rows = order.map((id, i) => {
    if (!counted.length) return { key: id, position: null };
    let pos = i + 1;
    while (pos > 1 && totals[order[pos - 2]] === totals[id]) pos--;
    return { key: id, position: pos };
  });
  const r = computePayoutsCents({ entryCents: game.entry, places: game.places }, rows);
  return {
    balances: r.balances,
    purse: r.purse,
    thru: counted.length,
    standings: rows.map((row) => ({ id: row.key, total: totals[row.key], position: row.position, cents: r.byKey[row.key] })),
  };
}
