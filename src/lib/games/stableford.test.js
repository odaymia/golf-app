import { describe, it, expect } from 'vitest';
import { scoreStableford, normalizeScoring, holePoints } from './stableford.js';
import { makeCtx, parCard, sum, PARS } from './test-helpers.js';

const ids = ['a', 'b', 'c', 'd'];
const base = { net: false, stake: 100, mode: 'perPoint', scoring: { preset: 'standard' } };

describe('stableford scoring rules', () => {
  it('presets and custom tables', () => {
    expect(normalizeScoring({ preset: 'modified' }).points).toMatchObject({ par: 0, bogey: -1, double: -3 });
    const own = { albatross: 9, eagle: 6, birdie: 4, par: 1, bogey: 0, double: -1 };
    expect(normalizeScoring({ preset: 'custom', points: own }).points).toEqual(own);
    expect(normalizeScoring(undefined)).toMatchObject({ preset: 'standard', bonusOn: false });
  });

  it('bonus follows the gross score', () => {
    const sc = normalizeScoring({ bonusOn: true });
    expect(holePoints(sc, 3, 4, 4)).toBe(3); // net birdie with a stroke: no bonus
    expect(holePoints(sc, 3, 3, 4)).toBe(4); // natural birdie +1
    expect(holePoints(sc, 1, 1, 3)).toBe(9); // ace on a par 3: eagle 4 + ace 5
  });
});

describe('individual stableford game', () => {
  it('per point: pay the difference to everyone ahead of you', () => {
    // a 37 (birdie), b 36, c 35 (bogey), d 36
    const ctx = makeCtx(ids, parCard(ids, { a: { 1: 3 }, c: { 2: 5 } }));
    const r = scoreStableford(ctx, base);
    expect(r.standings.map((s) => [s.id, s.total])).toEqual([
      ['a', 37],
      ['b', 36],
      ['d', 36],
      ['c', 35],
    ]);
    // a: +1 vs b, +2 vs c, +1 vs d = +4. c: -2 -1 -1 = -4.
    expect(r.balances).toEqual({ a: 400, b: 0, c: -400, d: 0 });
  });

  it('per player beaten: flat stake, ties push', () => {
    const ctx = makeCtx(ids, parCard(ids, { a: { 1: 3 }, c: { 2: 5 } }));
    const r = scoreStableford(ctx, { ...base, mode: 'perOpponent' });
    expect(r.balances).toEqual({ a: 300, b: 0, c: -300, d: 0 });
  });

  it('net uses strokes; custom table and bonus change the money', () => {
    const strokes = Object.fromEntries(ids.map((id) => [id, Array(18).fill(0)]));
    strokes.b[0] = 1;
    // a natural birdie on 1; b gross par with a stroke = net birdie
    const ctx = makeCtx(['a', 'b'], parCard(['a', 'b'], { a: { 1: 3 } }), strokes);
    const net = { ...base, net: true };
    expect(scoreStableford(ctx, net).balances).toEqual({ a: 0, b: 0 });
    const bonus = { ...net, scoring: { preset: 'standard', bonusOn: true, bonus: { birdie: 2 } } };
    expect(scoreStableford(ctx, bonus).balances).toEqual({ a: 200, b: -200 });
  });

  it('modified stableford: a blow-up hole costs points', () => {
    const ctx = makeCtx(['a', 'b'], parCard(['a', 'b'], { a: { 1: 8 } }));
    const r = scoreStableford(ctx, { ...base, scoring: { preset: 'modified' } });
    expect(r.standings.find((s) => s.id === 'a').total).toBe(-3);
    expect(r.balances).toEqual({ a: -300, b: 300 });
  });

  it('mid-round compares only holes both have played', () => {
    const ctx = makeCtx(['a', 'b'], parCard(['a', 'b'], { a: { 1: 3 } }, 3));
    ctx.gross.b[2] = null;
    expect(scoreStableford(ctx, base).balances).toEqual({ a: 100, b: -100 });
  });
});

describe('team stableford game', () => {
  const teams = [
    ['a', 'b'],
    ['c', 'd'],
  ];

  it('best ball: higher points on each hole counts', () => {
    // a birdies 1, b doubles 1 -> team AB takes a's 3. c birdies 2.
    // d birdies 3 -> CD 38 vs AB 37
    const ctx = makeCtx(ids, parCard(ids, { a: { 1: 3 }, b: { 1: 6 }, c: { 2: 3 }, d: { 3: PARS[2] - 1 } }));
    const r = scoreStableford(ctx, { ...base, teams, teamScore: 'bestBall' });
    expect(r.teamTotals).toEqual([37, 38]);
    expect(r.balances).toEqual({ a: -100, b: -100, c: 100, d: 100 });
    expect(sum(r.balances)).toBe(0);
  });

  it('combined: both balls count', () => {
    const ctx = makeCtx(ids, parCard(ids, { a: { 1: 3 }, b: { 1: 6 }, c: { 2: 3 }, d: { 3: PARS[2] - 1 } }));
    const r = scoreStableford(ctx, { ...base, teams, teamScore: 'aggregate' });
    // AB: 72 + 1 - 2 = 71. CD: 72 + 2 = 74.
    expect(r.teamTotals).toEqual([71, 74]);
    expect(r.balances).toEqual({ a: -300, b: -300, c: 300, d: 300 });
  });

  it('flat stake for the winning team; tie pushes', () => {
    const ctx = makeCtx(ids, parCard(ids, { a: { 1: 3 }, c: { 2: 3 } }));
    expect(scoreStableford(ctx, { ...base, teams, mode: 'perOpponent' }).balances).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });
});
