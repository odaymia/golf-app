import { scoreFor, holeCount } from './scores.js';
import { computePayoutsCents } from '../league/payouts.js';

// Paying a game by finishing place: everyone puts in the entry, the pot is
// paid to 1st, 2nd, 3rd... by a percent per place (ties share the places they
// cover, to the cent; see league/payouts.js). Used as a payout option of
// stroke play (lowest total wins) and Stableford (most points wins).
// Ranked on the holes every player has finished, so a round in progress
// compares like with like. Balances are winnings minus entry (net zero);
// before anyone has a full hole nobody owes anything.
//   ids, n (holes), valueOn(id, h) -> number | null, lowerWins,
//   entry (cents per player), places: [percent, ...]
export function payByPlace({ ids, n, valueOn, lowerWins, entry, places }) {
  const counted = [];
  for (let h = 0; h < n; h++) if (ids.every((id) => valueOn(id, h) != null)) counted.push(h);
  const totals = Object.fromEntries(ids.map((id) => [id, counted.reduce((t, h) => t + valueOn(id, h), 0)]));
  const better = (a, b) => (lowerWins ? totals[a] - totals[b] : totals[b] - totals[a]);
  const order = [...ids].sort(better);
  const rows = order.map((id, i) => {
    if (!counted.length) return { key: id, position: null };
    let pos = i + 1;
    while (pos > 1 && totals[order[pos - 2]] === totals[id]) pos--;
    return { key: id, position: pos };
  });
  const r = computePayoutsCents({ entryCents: entry, places }, rows);
  return {
    balances: r.balances,
    purse: r.purse,
    thru: counted.length,
    standings: rows.map((row) => ({ id: row.key, total: totals[row.key], thru: counted.length, position: row.position, cents: r.byKey[row.key] })),
  };
}

// Older rounds saved with a stand-alone "places" game (lowest total wins).
// game = { net, entry (cents), places }
export function scorePlaces(ctx, game) {
  return payByPlace({
    ids: ctx.players.map((p) => p.id),
    n: holeCount(ctx),
    valueOn: (id, h) => scoreFor(ctx, id, h, game.net),
    lowerWins: true,
    entry: game.entry,
    places: game.places,
  });
}
