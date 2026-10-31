// Money is always integer cents. Every game returns a balance map
// { playerId: cents } that sums to exactly zero.

export function emptyBalances(playerIds) {
  return Object.fromEntries(playerIds.map((id) => [id, 0]));
}

export function addBalances(target, source) {
  for (const [id, cents] of Object.entries(source)) {
    target[id] = (target[id] ?? 0) + cents;
  }
  return target;
}

export function sumBalances(balances) {
  return Object.values(balances).reduce((a, b) => a + b, 0);
}

// A team bet between equal-sized sides: each winner collects `cents`,
// each loser pays `cents` (players pair off against their counterparts).
export function payTeamBet(balances, winners, losers, cents) {
  if (winners.length !== losers.length) {
    throw new Error('Team bets need equal-sized sides');
  }
  for (const id of winners) balances[id] += cents;
  for (const id of losers) balances[id] -= cents;
}

// Split `totalCents` by integer weights with no lost or invented cents.
// Largest-remainder method; leftover cents go to the largest fractional
// shares, ties broken by the order of `ids`.
export function splitByWeight(totalCents, ids, weights) {
  const totalWeight = ids.reduce((s, id) => s + (weights[id] ?? 0), 0);
  const shares = Object.fromEntries(ids.map((id) => [id, 0]));
  if (totalWeight === 0) return shares;
  const parts = ids.map((id, order) => {
    const exact = totalCents * (weights[id] ?? 0);
    const floor = Math.floor(exact / totalWeight);
    return { id, order, floor, remainder: exact - floor * totalWeight };
  });
  let left = totalCents - parts.reduce((s, p) => s + p.floor, 0);
  parts
    .slice()
    .sort((a, b) => b.remainder - a.remainder || a.order - b.order)
    .forEach((p) => {
      if (left > 0 && p.remainder > 0) {
        p.floor += 1;
        left -= 1;
      }
    });
  for (const p of parts) shares[p.id] = p.floor;
  return shares;
}

export function dollarsToCents(dollars) {
  const n = Number(dollars);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatMoney(cents, { signed = false } = {}) {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const body = rest === 0 ? `$${dollars}` : `$${dollars}.${String(rest).padStart(2, '0')}`;
  if (cents < 0) return `-${body}`;
  if (signed && cents > 0) return `+${body}`;
  return body;
}
