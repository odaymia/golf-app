import { describe, it, expect } from 'vitest';
import { settle } from './settle.js';

function apply(balances, payments) {
  const b = { ...balances };
  for (const p of payments) {
    expect(p.cents).toBeGreaterThan(0);
    b[p.from] += p.cents;
    b[p.to] -= p.cents;
  }
  return b;
}

// Fewest payments by brute force: n - (max zero-sum groups).
function optimalCount(values) {
  const vals = values.filter((v) => v !== 0);
  const n = vals.length;
  const memo = new Map();
  const groups = (mask) => {
    if (mask === 0) return 0;
    if (memo.has(mask)) return memo.get(mask);
    let best = -Infinity;
    const first = mask & -mask;
    for (let sub = mask; sub; sub = (sub - 1) & mask) {
      if (!(sub & first)) continue;
      let s = 0;
      for (let i = 0; i < n; i++) if (sub & (1 << i)) s += vals[i];
      if (s === 0) best = Math.max(best, 1 + groups(mask ^ sub));
    }
    memo.set(mask, best);
    return best;
  };
  return n === 0 ? 0 : n - groups((1 << n) - 1);
}

describe('settle', () => {
  it('nobody owes anything', () => {
    expect(settle({ a: 0, b: 0 })).toEqual([]);
  });

  it('one payment between two players', () => {
    expect(settle({ mike: -1400, dave: 1400 })).toEqual([{ from: 'mike', to: 'dave', cents: 1400 }]);
  });

  it('pairs that cancel are paid directly', () => {
    const p = settle({ a: 500, b: -500, c: 300, d: -300 });
    expect(p).toHaveLength(2);
    expect(apply({ a: 500, b: -500, c: 300, d: -300 }, p)).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('beats greedy when groups cancel out', () => {
    // greedy biggest-to-biggest takes 4 payments; best is 3 ({a,e} and {b,c,d})
    const bal = { a: 400, b: 300, c: 200, d: -500, e: -400 };
    const p = settle(bal);
    expect(p).toHaveLength(3);
    expect(apply(bal, p)).toEqual({ a: 0, b: 0, c: 0, d: 0, e: 0 });
  });

  it('one winner, three losers', () => {
    const bal = { a: 1500, b: -500, c: -700, d: -300 };
    const p = settle(bal);
    expect(p).toHaveLength(3);
    expect(p.every((x) => x.to === 'a')).toBe(true);
  });

  it('refuses balances that do not net to zero', () => {
    expect(() => settle({ a: 100, b: -99 })).toThrow(/off by 1/);
  });

  it('random foursomes and larger groups: always exact, always minimal', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + Math.floor(rand() * 6);
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const bal = {};
      let total = 0;
      for (let i = 0; i < n - 1; i++) {
        // small values make zero-sum groups common
        bal[ids[i]] = (Math.floor(rand() * 9) - 4) * 100;
        total += bal[ids[i]];
      }
      bal[ids[n - 1]] = -total;
      const p = settle(bal, ids);
      const after = apply(bal, p);
      expect(Object.values(after).every((v) => v === 0)).toBe(true);
      expect(p.length).toBe(optimalCount(ids.map((id) => bal[id])));
    }
  });
});
