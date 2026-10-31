import { describe, it, expect } from 'vitest';
import { scoreWolf, wolfForHole } from './wolf.js';
import { makeCtx, parCard, sum } from './test-helpers.js';

const ids = ['a', 'b', 'c', 'd'];
const order = ['a', 'b', 'c', 'd'];

function wolf(overrides, decisions, opts = {}, played = 18) {
  const ctx = makeCtx(ids, parCard(ids, overrides, played));
  return scoreWolf(ctx, { net: false, stake: 100, loneMult: 2, blindMult: 3, order, decisions, ...opts });
}

describe('wolf rotation', () => {
  it('rotates through the order every 4 holes', () => {
    expect([1, 2, 3, 4, 5, 9, 17, 18].map((h) => wolfForHole(order, h))).toEqual([
      'a', 'b', 'c', 'd', 'a', 'a', 'a', 'b',
    ]);
  });

  it('needs exactly 4 players', () => {
    const ctx = makeCtx(['a', 'b', 'c'], parCard(['a', 'b', 'c']));
    expect(() => scoreWolf(ctx, { order: ['a', 'b', 'c'], stake: 100 })).toThrow();
  });
});

describe('wolf with a partner (2 vs 2)', () => {
  it('wolf team wins: each winner collects the stake', () => {
    const r = wolf({ c: { 1: 3 } }, { 1: { partner: 'c' } });
    expect(r.balances).toEqual({ a: 100, b: -100, c: 100, d: -100 });
    expect(r.holes[0]).toMatchObject({ wolf: 'a', kind: 'partner', result: 'wolf won' });
  });

  it('wolf team loses', () => {
    const r = wolf({ d: { 2: 3 } }, { 2: { partner: 'a' } });
    expect(r.balances).toEqual({ a: -100, b: -100, c: 100, d: 100 });
  });

  it('tie pushes', () => {
    const r = wolf({}, { 1: { partner: 'b' } });
    expect(r.balances).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(r.holes[0].result).toBe('push');
  });
});

describe('lone and blind wolf', () => {
  it('lone wolf wins double from each of the other three', () => {
    const r = wolf({ a: { 1: 3 } }, { 1: { lone: true } });
    expect(r.balances).toEqual({ a: 600, b: -200, c: -200, d: -200 });
  });

  it('lone wolf loses double to each of the other three', () => {
    // b is wolf on hole 2 and loses to d's birdie
    const r = wolf({ d: { 2: 3 } }, { 2: { lone: true } });
    expect(r.balances).toEqual({ a: 200, b: -600, c: 200, d: 200 });
  });

  it('lone wolf tie pushes', () => {
    const r = wolf({}, { 1: { lone: true } });
    expect(r.balances).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('blind wolf is triple', () => {
    const r = wolf({ c: { 3: 2 } }, { 3: { blind: true } });
    expect(r.balances).toEqual({ a: -300, b: -300, c: 900, d: -300 });
    expect(r.holes[2].kind).toBe('blind');
  });

  it('custom multipliers', () => {
    const r = wolf({ a: { 1: 3 } }, { 1: { lone: true } }, { loneMult: 4 });
    expect(r.balances.a).toBe(1200);
  });
});

describe('wolf bookkeeping', () => {
  it('holes without a pick are skipped', () => {
    const r = wolf({ a: { 1: 3 } }, {});
    expect(r.holes[0].result).toBe('no pick');
    expect(r.balances).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('unscored holes are skipped', () => {
    const r = wolf({}, { 5: { lone: true } }, {}, 4);
    expect(r.holes[4].result).toBe('not scored');
  });

  it('net wolf uses strokes', () => {
    const strokes = Object.fromEntries(ids.map((id) => [id, Array(18).fill(0)]));
    strokes.b[0] = 1;
    const ctx = makeCtx(ids, parCard(ids), strokes);
    const r = scoreWolf(ctx, { net: true, stake: 100, order, decisions: { 1: { partner: 'b' } } });
    expect(r.balances).toEqual({ a: 100, b: 100, c: -100, d: -100 });
  });

  it('a whole round stays zero-sum', () => {
    const decisions = {};
    for (let h = 1; h <= 18; h++) {
      decisions[h] = h % 3 === 0 ? { lone: true } : h % 5 === 0 ? { blind: true } : { partner: order[h % 4] };
    }
    // Make sure the partner is never the wolf
    for (let h = 1; h <= 18; h++) {
      if (decisions[h].partner === wolfForHole(order, h)) decisions[h] = { partner: order[(h + 1) % 4] };
    }
    const r = wolf({ a: { 3: 2, 7: 2 }, b: { 10: 3, 15: 3 }, c: { 5: 6 }, d: { 18: 3 } }, decisions);
    expect(sum(r.balances)).toBe(0);
  });
});
