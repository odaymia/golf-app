import { describe, it, expect } from 'vitest';
import { scoreSkins } from './skins.js';
import { makeCtx, parCard, sum, PARS } from './test-helpers.js';

const ids = ['a', 'b', 'c', 'd'];
const base = { net: false, carryover: true, validate: false, mode: 'perSkin', stake: 100 };

function skins(overrides, opts = {}, played = 18) {
  const ctx = makeCtx(ids, parCard(ids, overrides, played));
  return scoreSkins(ctx, { ...base, ...opts });
}

describe('skins basics', () => {
  it('lone low score wins; each other player pays the winner', () => {
    const r = skins({ a: { 1: 3 } });
    expect(r.won).toEqual({ a: 1, b: 0, c: 0, d: 0 });
    expect(r.balances).toEqual({ a: 300, b: -100, c: -100, d: -100 });
  });

  it('two different winners net out', () => {
    // hole 1: a; hole 2: b
    const r = skins({ a: { 1: 3 }, b: { 2: 3 } });
    expect(r.balances).toEqual({ a: 200, b: 200, c: -200, d: -200 });
  });

  it('a tie for low is not a skin even if others are worse', () => {
    const r = skins({ a: { 1: 3 }, b: { 1: 3 } }, { carryover: false });
    expect(r.won).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(r.holes[0].status).toBe('dead');
  });
});

describe('carryovers', () => {
  it('ties carry the skin to the next hole', () => {
    // holes 1-2 tied, c wins hole 3 worth 3 skins
    const r = skins({ c: { 3: 2 } });
    expect(r.holes[2]).toMatchObject({ hole: 3, winner: 'c', value: 3 });
    expect(r.won.c).toBe(3);
    expect(r.balances).toEqual({ a: -300, b: -300, c: 900, d: -300 });
  });

  it('without carryovers tied skins die', () => {
    const r = skins({ c: { 3: 2 } }, { carryover: false });
    expect(r.won.c).toBe(1);
  });

  it('skins still tied after 18 go unwon', () => {
    // a wins hole 1, everything else ties
    const r = skins({ a: { 1: 3 } });
    expect(r.carry).toBe(17);
    expect(r.won.a).toBe(1);
  });

  it('carry resets after a win', () => {
    const r = skins({ a: { 3: 2 }, b: { 6: 3 } });
    expect(r.holes[2].value).toBe(3);
    expect(r.holes[5].value).toBe(3); // holes 4,5,6
  });

  it('mid-round reports the current carry', () => {
    const r = skins({}, {}, 4);
    expect(r.thru).toBe(4);
    expect(r.carry).toBe(4);
    expect(r.balances).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });
});

describe('net skins', () => {
  it('a stroke can win the skin', () => {
    const strokes = Object.fromEntries(ids.map((id) => [id, Array(18).fill(0)]));
    strokes.d[0] = 1; // d gets a stroke on hole 1
    const ctx = makeCtx(ids, parCard(ids, { a: { 1: 3 }, d: { 1: 3 } }), strokes);
    const gross = scoreSkins(ctx, { ...base, carryover: false });
    const net = scoreSkins(ctx, { ...base, carryover: false, net: true });
    expect(gross.won.d).toBe(0);
    expect(net.won.d).toBe(1);
  });
});

describe('validation', () => {
  it('winner who ties low on the next hole keeps the skin', () => {
    const r = skins({ a: { 1: 3 } }, { validate: true });
    expect(r.holes[0].status).toBe('validated');
    expect(r.won.a).toBe(1);
  });

  it('winner who loses the next hole gives the skin back to the pot', () => {
    // a wins 1, then b beats everyone on 2: a's skin carries into hole 2,
    // so b wins 2 skins on hole 2 (if b validates on 3).
    const r = skins({ a: { 1: 3 }, b: { 2: 3 } }, { validate: true });
    expect(r.holes[0].status).toBe('not validated');
    expect(r.holes[1]).toMatchObject({ winner: 'b', value: 2, status: 'validated' });
    expect(r.won).toEqual({ a: 0, b: 2, c: 0, d: 0 });
  });

  it('a skin won on the last hole needs no validation', () => {
    const r = skins({ a: { 18: PARS[17] - 1 } }, { validate: true });
    expect(r.holes[17]).toMatchObject({ winner: 'a', value: 18, status: 'won' });
    expect(r.won.a).toBe(18);
  });

  it('pending skin is not paid until the next hole is played', () => {
    const r = skins({ a: { 1: 3 } }, { validate: true }, 1);
    expect(r.pending).toEqual({ winner: 'a', value: 1 });
    expect(r.won.a).toBe(0);
  });

  it('winner can validate by winning the next hole outright', () => {
    const r = skins({ a: { 1: 3, 2: 3 } }, { validate: true });
    expect(r.won.a).toBe(2);
  });
});

describe('pot mode', () => {
  it('pot is split by skins won, to the cent', () => {
    // a wins hole 1 and 2 = 2 skins; b wins hole 4 (worth 2: holes 3,4)... keep simple:
    const r = skins({ a: { 1: 3, 2: 3 }, b: { 3: 2 } }, { mode: 'pot', buyIn: 500, carryover: false });
    expect(r.won).toEqual({ a: 2, b: 1, c: 0, d: 0 });
    // $20 pot: a 2/3 = 1333.33 -> 1333, b 1/3 = 666.67 -> 667
    expect(r.balances).toEqual({ a: 833, b: 167, c: -500, d: -500 });
    expect(sum(r.balances)).toBe(0);
  });

  it('nobody wins a skin: everyone gets their money back', () => {
    const r = skins({}, { mode: 'pot', buyIn: 500 });
    expect(r.balances).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });
});

describe('two and three players', () => {
  it('works for a twosome', () => {
    const ctx = makeCtx(['a', 'b'], parCard(['a', 'b'], { b: { 5: 3 } }));
    const r = scoreSkins(ctx, base);
    expect(r.balances).toEqual({ a: -500, b: 500 });
  });

  it('works for a threesome', () => {
    const t = ['a', 'b', 'c'];
    const ctx = makeCtx(t, parCard(t, { b: { 1: 3 }, c: { 2: 3 } }));
    const r = scoreSkins(ctx, base);
    expect(r.balances).toEqual({ a: -200, b: 100, c: 100 });
  });
});
