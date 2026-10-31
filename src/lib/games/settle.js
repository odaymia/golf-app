// Settle-up: turn net balances into the fewest possible payments.
//
// The fewest payments = (players who owe or are owed) - (most groups the
// players can be split into where each group nets to zero). With a foursome
// that's tiny, so we find the best split exactly with a bitmask search.

export function settle(balances, order = Object.keys(balances)) {
  const people = order
    .filter((id) => balances[id] !== 0 && balances[id] != null)
    .map((id) => ({ id, cents: balances[id] }));
  const total = people.reduce((s, p) => s + p.cents, 0);
  if (total !== 0) throw new Error(`Balances do not net to zero (off by ${total} cents)`);
  if (people.length === 0) return [];
  if (people.length > 16) return payGroup(people);

  const n = people.length;
  const full = (1 << n) - 1;
  const sum = new Array(full + 1).fill(0);
  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask;
    sum[mask] = sum[mask ^ low] + people[31 - Math.clz32(low)].cents;
  }
  // best[mask] = most zero-sum groups the people in `mask` can be split into
  // (valid when sum[mask] === 0); built by peeling off one person at a time.
  const best = new Array(full + 1).fill(0);
  for (let mask = 1; mask <= full; mask++) {
    let m = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) m = Math.max(m, best[mask ^ (1 << i)]);
    }
    best[mask] = m + (sum[mask] === 0 ? 1 : 0);
  }

  // Recover an ordering whose zero-sum prefixes are the groups.
  const ordering = [];
  let mask = full;
  while (mask) {
    const target = best[mask] - (sum[mask] === 0 ? 1 : 0);
    for (let i = n - 1; i >= 0; i--) {
      if (mask & (1 << i) && best[mask ^ (1 << i)] === target) {
        ordering.push(i);
        mask ^= 1 << i;
        break;
      }
    }
  }
  ordering.reverse();

  const payments = [];
  let group = [];
  let running = 0;
  for (const i of ordering) {
    group.push(people[i]);
    running += people[i].cents;
    if (running === 0) {
      payments.push(...payGroup(group));
      group = [];
    }
  }
  return payments;
}

// Within a zero-sum group: biggest debtor pays biggest creditor until done.
// Takes at most (group size - 1) payments.
function payGroup(group) {
  const debtors = group.filter((p) => p.cents < 0).map((p) => ({ ...p, cents: -p.cents }));
  const creditors = group.filter((p) => p.cents > 0).map((p) => ({ ...p }));
  const byAmount = (a, b) => b.cents - a.cents;
  const payments = [];
  debtors.sort(byAmount);
  creditors.sort(byAmount);
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].cents, creditors[c].cents);
    payments.push({ from: debtors[d].id, to: creditors[c].id, cents: amount });
    debtors[d].cents -= amount;
    creditors[c].cents -= amount;
    if (debtors[d].cents === 0) d++;
    if (creditors[c].cents === 0) c++;
  }
  return payments;
}
