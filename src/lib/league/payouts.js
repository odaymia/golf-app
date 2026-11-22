// Payouts by finishing place (1st, 2nd, 3rd...) for a round or a whole
// tournament. Pure, integer cents. Scribble never holds the money: this
// says who gets what, and (when the purse is everyone's entry fee) who pays
// whom to settle up.
//
// config: { on, entry, purse, places }
//   entry  dollars each entrant puts in (purse = entry x entrants)
//   purse  dollars, optional: a fixed purse (prize money) instead of entries
//   places percent of the purse for 1st, 2nd, 3rd... (normalized to the purse)
// Ties: players tied for a place share the money for all the places they
// cover (two tied for 2nd split 2nd + 3rd), to the cent.

import { dollarsToCents, splitByWeight } from '../games/money.js';

export const PAYOUT_PRESETS = [
  { key: 'winner', label: 'Winner takes all', places: [100] },
  { key: 'top2', label: 'Top 2 · 60/40', places: [60, 40] },
  { key: 'top3', label: 'Top 3 · 50/30/20', places: [50, 30, 20] },
  { key: 'top4', label: 'Top 4 · 40/30/20/10', places: [40, 30, 20, 10] },
  { key: 'top5', label: 'Top 5 · 35/25/18/13/9', places: [35, 25, 18, 13, 9] },
];

export function defaultPayouts() {
  return { on: false, entry: 20, purse: '', places: [50, 30, 20] };
}

export function normalizePayouts(p) {
  const d = defaultPayouts();
  if (!p || typeof p !== 'object') return d;
  const places = Array.isArray(p.places) ? p.places.map((x) => Math.max(0, Number(x) || 0)).slice(0, 10) : d.places;
  return { on: !!p.on, entry: p.entry ?? d.entry, purse: p.purse ?? '', places: places.length ? places : d.places };
}

const fixedPurse = (cfg) => cfg.purse !== '' && cfg.purse != null && dollarsToCents(cfg.purse) > 0;

// Total purse in cents for this many entrants.
export function purseCents(cfg, entrants) {
  return fixedPurse(cfg) ? dollarsToCents(cfg.purse) : Math.max(0, dollarsToCents(cfg.entry)) * entrants;
}

// rows: [{ key, position }] best first; position null = not placed yet
// (counts as an entrant, can't win). Returns
//   { purse, entry, fromEntries, amounts: [cents per place paid],
//     lines: [{ key, position, place, cents, tied }], byKey: { key: cents },
//     balances: { key: cents } | null (payout minus entry; zero-sum) }
export function computePayouts(config, rows) {
  const cfg = normalizePayouts(config);
  const fixed = fixedPurse(cfg);
  return computePayoutsCents(
    { entryCents: Math.max(0, dollarsToCents(cfg.entry)), purseCents: fixed ? dollarsToCents(cfg.purse) : null, places: cfg.places },
    rows,
  );
}

// The same in cents (the casual-round engine uses this directly).
// { entryCents, purseCents: null = entries x entrants, places: [percent] }
export function computePayoutsCents({ entryCents = 0, purseCents = null, places = [] }, rows) {
  const fromEntries = purseCents == null;
  const purse = fromEntries ? entryCents * rows.length : purseCents;
  const ranked = rows.filter((r) => r.position != null);
  // Only as many paid places as there are players placed, so the whole
  // purse is always paid out.
  const pcts = places.map((x) => Math.max(0, Number(x) || 0)).filter((x) => x > 0).slice(0, ranked.length);
  const idx = pcts.map((_, i) => String(i));
  const split = splitByWeight(purse, idx, Object.fromEntries(pcts.map((x, i) => [String(i), x])));
  const amounts = idx.map((i) => split[i]);

  const byKey = Object.fromEntries(rows.map((r) => [r.key, 0]));
  const lines = [];
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j < ranked.length && ranked[j].position === ranked[i].position) j++;
    const group = ranked.slice(i, j);
    const pool = amounts.slice(i, j).reduce((s, x) => s + x, 0);
    const keys = group.map((r) => r.key);
    const shares = splitByWeight(pool, keys, Object.fromEntries(keys.map((k) => [k, 1])));
    for (const r of group) {
      byKey[r.key] = shares[r.key];
      lines.push({ key: r.key, position: r.position, place: i + 1, cents: shares[r.key], tied: group.length > 1 });
    }
    i = j;
  }
  // With nobody placed yet nothing is paid, so no one owes anything either.
  const entry = fromEntries ? entryCents : 0;
  const balances = fromEntries ? Object.fromEntries(rows.map((r) => [r.key, ranked.length ? byKey[r.key] - entry : 0])) : null;
  return { purse, entry, fromEntries, amounts, lines, byKey, balances };
}

// "1st", "2nd", "3rd", "11th"...
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Finishing order by score to par on the holes played (net or gross), for
// rounds that have no board of their own (match play). players: the round
// result's players { id: { thru, grossTotal, netTotal, parPlayed } }.
// Returns [{ key, name, position }] best first; no holes played = unplaced.
export function rowsByToPar(players, members, net) {
  const rows = members
    .filter((m) => players[m.id])
    .map((m) => {
      const p = players[m.id];
      const toPar = p.thru ? (net ? p.netTotal : p.grossTotal) - p.parPlayed : null;
      return { key: m.id, name: m.name, toPar };
    });
  const played = rows.filter((r) => r.toPar != null).sort((a, b) => a.toPar - b.toPar);
  let pos = 0;
  const ranked = played.map((r, i) => {
    if (i === 0 || played[i - 1].toPar !== r.toPar) pos = i + 1;
    return { key: r.key, name: r.name, position: pos };
  });
  return [...ranked, ...rows.filter((r) => r.toPar == null).map((r) => ({ key: r.key, name: r.name, position: null }))];
}
