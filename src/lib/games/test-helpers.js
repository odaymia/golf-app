// Builders for engine tests.

export const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
export const HCPS = [7, 15, 3, 11, 1, 17, 5, 13, 9, 8, 16, 4, 12, 2, 18, 6, 14, 10];

// Everyone shoots par unless overridden: overrides = { id: { hole1Based: score } }.
export function parCard(ids, overrides = {}, played = 18) {
  const gross = {};
  for (const id of ids) {
    gross[id] = PARS.map((par, h) => {
      if (h >= played) return null;
      return overrides[id]?.[h + 1] ?? par;
    });
  }
  return gross;
}

export function makeCtx(ids, gross, strokes = {}) {
  const zero = () => PARS.map(() => 0);
  return {
    players: ids.map((id) => ({ id, name: id.toUpperCase() })),
    holes: PARS.map((par, h) => ({ par, hcp: HCPS[h] })),
    gross,
    strokes: Object.fromEntries(ids.map((id) => [id, strokes[id] ?? zero()])),
  };
}

// Score a whole card from per-hole winners for a 1v1 match between a and b:
// 'a' = a wins (birdie), 'b' = b wins, anything else = halve (pars).
export function matchCard(sequence) {
  const a = {};
  const b = {};
  sequence.split('').forEach((c, i) => {
    if (c === 'a') a[i + 1] = PARS[i] - 1;
    if (c === 'b') b[i + 1] = PARS[i] - 1;
  });
  const played = sequence.length;
  return parCard(['a', 'b'], { a, b }, played);
}

export function sum(balances) {
  return Object.values(balances).reduce((x, y) => x + y, 0);
}
