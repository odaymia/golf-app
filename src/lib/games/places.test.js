import { describe, it, expect } from 'vitest';
import { scorePlaces } from './places.js';
import { makeCtx, parCard, sum } from './test-helpers.js';
import { computeRound } from './round.js';

const ids = ['a', 'b', 'c', 'd'];
const game = (extra = {}) => ({ net: false, entry: 2000, places: [50, 30, 20], ...extra });

describe('payouts by place (casual round)', () => {
  it('pays 1st/2nd/3rd from the entries and nets to zero', () => {
    // a -2, b -1, c even, d +1 over 18
    const ctx = makeCtx(ids, parCard(ids, { a: { 1: 3, 2: 3 }, b: { 1: 3 }, d: { 1: 5 } }));
    const r = scorePlaces(ctx, game());
    expect(r.purse).toBe(8000);
    expect(r.balances).toEqual({ a: 4000 - 2000, b: 2400 - 2000, c: 1600 - 2000, d: -2000 });
    expect(sum(r.balances)).toBe(0);
    expect(r.standings.map((s) => [s.id, s.position])).toEqual([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
  });

  it('ties share the places they cover', () => {
    const ctx = makeCtx(ids, parCard(ids, { a: { 1: 3 }, b: { 1: 3 }, d: { 1: 5 } }));
    const r = scorePlaces(ctx, game());
    // a and b tie for 1st: split 1st + 2nd = $64 -> $32 each
    expect(r.standings.find((s) => s.id === 'a').cents).toBe(3200);
    expect(r.standings.find((s) => s.id === 'b').cents).toBe(3200);
    expect(r.standings.find((s) => s.id === 'c').cents).toBe(1600);
    expect(sum(r.balances)).toBe(0);
  });

  it('mid-round compares only holes everyone has finished', () => {
    const gross = parCard(ids, { a: { 1: 3 } }, 3);
    gross.d[2] = null; // d hasn't finished hole 3
    gross.a[2] = 9; // a's blow-up on hole 3 doesn't count yet
    const r = scorePlaces(makeCtx(ids, gross), game({ places: [100] }));
    expect(r.thru).toBe(2);
    expect(r.standings[0].id).toBe('a');
  });

  it('before anyone has a full hole, nobody owes anything', () => {
    const r = scorePlaces(makeCtx(ids, parCard(ids, {}, 0)), game());
    expect(r.balances).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('runs inside a round with the other games', () => {
    const round = {
      course: { name: 'X', holes: makeCtx(ids, {}).holes },
      tee: { rating: 72, slope: 113 },
      players: ids.map((id) => ({ id, name: id, index: 0 })),
      handicap: { allowance: 100, offLow: true },
      games: [{ id: 'places', type: 'places', ...game() }],
      scores: parCard(ids, { a: { 1: 3 } }),
    };
    const r = computeRound(round);
    expect(sum(r.totals)).toBe(0);
    expect(r.totals.a).toBe(2000 + 0); // won 1st ($40) minus $20 entry
  });
});
