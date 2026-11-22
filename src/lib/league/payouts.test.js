import { describe, it, expect } from 'vitest';
import { computePayouts, normalizePayouts, ordinal, purseCents } from './payouts.js';
import { settle } from '../games/settle.js';

const rows = (positions) => positions.map((position, i) => ({ key: `p${i + 1}`, position }));
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

describe('payouts by place', () => {
  it('splits the entry-fee purse 50/30/20', () => {
    // 10 players x $20 = $200
    const r = computePayouts({ on: true, entry: 20, places: [50, 30, 20] }, rows([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(r.purse).toBe(20000);
    expect(r.amounts).toEqual([10000, 6000, 4000]);
    expect(r.byKey.p1).toBe(10000);
    expect(r.byKey.p4).toBe(0);
    expect(sum(r.byKey)).toBe(r.purse);
    expect(r.balances.p1).toBe(8000);
    expect(r.balances.p10).toBe(-2000);
    expect(sum(r.balances)).toBe(0);
  });

  it('ties share the places they cover, to the cent', () => {
    // two tied for 2nd split 2nd + 3rd; three-way tie splits pennies exactly
    const r = computePayouts({ on: true, entry: 10, places: [50, 30, 20] }, rows([1, 2, 2, 4]));
    expect(r.purse).toBe(4000);
    expect(r.byKey).toEqual({ p1: 2000, p2: 1000, p3: 1000, p4: 0 });
    const t = computePayouts({ on: true, entry: 10, places: [100] }, rows([1, 1, 1, 4, 5, 6, 7]));
    expect([t.byKey.p1, t.byKey.p2, t.byKey.p3]).toEqual([2334, 2333, 2333]);
    expect(sum(t.byKey)).toBe(7000);
  });

  it('a tie for the last paid place splits only what that place pays', () => {
    const r = computePayouts({ on: true, entry: 10, places: [50, 30, 20] }, rows([1, 2, 3, 3, 5]));
    expect(r.byKey.p3 + r.byKey.p4).toBe(1000); // 20% of $50, plus nothing for 4th
    expect(r.byKey.p3).toBe(500);
  });

  it('fewer players than paid places still pays the whole purse', () => {
    const r = computePayouts({ on: true, entry: 25, places: [50, 30, 20] }, rows([1, 2]));
    expect(r.amounts).toEqual([3125, 1875]); // 50:30 of $50
    expect(sum(r.byKey)).toBe(5000);
  });

  it('players not placed yet count as entrants but win nothing', () => {
    const r = computePayouts({ on: true, entry: 10, places: [100] }, rows([1, null]));
    expect(r.purse).toBe(2000);
    expect(r.byKey).toEqual({ p1: 2000, p2: 0 });
  });

  it('a fixed purse pays out with no settle-up', () => {
    const r = computePayouts({ on: true, entry: 20, purse: '500', places: [60, 40] }, rows([1, 2, 3]));
    expect(r.purse).toBe(50000);
    expect(r.byKey).toEqual({ p1: 30000, p2: 20000, p3: 0 });
    expect(r.balances).toBe(null);
    expect(r.fromEntries).toBe(false);
  });

  it('settle-up from entry fees pays everything back exactly', () => {
    const r = computePayouts({ on: true, entry: 15, places: [50, 30, 20] }, rows([1, 2, 3, 4, 5, 6]));
    const pays = settle(r.balances);
    const net = Object.fromEntries(Object.keys(r.balances).map((k) => [k, 0]));
    for (const p of pays) {
      net[p.from] -= p.cents;
      net[p.to] += p.cents;
    }
    expect(net).toEqual(r.balances);
  });

  it('cleans up bad settings and counts places', () => {
    expect(normalizePayouts(null)).toEqual({ on: false, entry: 20, purse: '', places: [50, 30, 20] });
    expect(normalizePayouts({ places: ['60', -5, 'x'] }).places).toEqual([60, 0, 0]);
    expect(purseCents({ entry: '12.50', purse: '' }, 4)).toBe(5000);
    expect(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'].join()).toBe([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal).join());
  });
});

import { rowsByToPar } from './payouts.js';

describe('finishing order for match-play rounds', () => {
  const members = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D' },
  ];
  const p = (thru, gross, net, par) => ({ thru, grossTotal: gross, netTotal: net, parPlayed: par });
  it('ranks by net (or gross) to par on the holes played; ties share; no holes = unplaced', () => {
    const players = { a: p(18, 75, 70, 72), b: p(18, 74, 72, 72), c: p(9, 36, 34, 36), d: p(0, 0, 0, 0) };
    expect(rowsByToPar(players, members, true)).toEqual([
      { key: 'a', name: 'A', position: 1 }, // -2
      { key: 'c', name: 'C', position: 1 }, // -2 thru 9
      { key: 'b', name: 'B', position: 3 }, // E
      { key: 'd', name: 'D', position: null },
    ]);
    expect(rowsByToPar(players, members, false).map((r) => r.key)).toEqual(['c', 'b', 'a', 'd']);
  });
});
