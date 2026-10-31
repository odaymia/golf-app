import { describe, it, expect } from 'vitest';
import { scoreStrokePlay } from './stroke.js';
import { makeCtx, parCard, sum } from './test-helpers.js';

const ids = ['a', 'b', 'c', 'd'];

describe('stroke play', () => {
  it('per opponent: beat someone, collect the stake; ties push', () => {
    // a 70, b 72, c 72, d 75
    const ctx = makeCtx(ids, parCard(ids, { a: { 1: 3, 2: 3 }, d: { 1: 5, 2: 5, 3: 4 } }));
    const r = scoreStrokePlay(ctx, { net: false, mode: 'perOpponent', stake: 500 });
    expect(r.balances).toEqual({ a: 1500, b: 0, c: 0, d: -1500 });
    expect(r.standings.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.standings[0]).toMatchObject({ total: 70, thru: 18 });
  });

  it('per stroke: pay the difference', () => {
    const ctx = makeCtx(['a', 'b'], parCard(['a', 'b'], { a: { 1: 3 }, b: { 2: 6 } }));
    const r = scoreStrokePlay(ctx, { net: false, mode: 'perStroke', stake: 100 });
    expect(r.balances).toEqual({ a: 300, b: -300 });
  });

  it('net scores use handicap strokes', () => {
    const strokes = { a: Array(18).fill(0), b: Array(18).fill(1) };
    const ctx = makeCtx(['a', 'b'], parCard(['a', 'b'], { b: { 1: 5, 2: 5 } }), strokes);
    // gross a 72, b 74; net b 56
    expect(scoreStrokePlay(ctx, { net: false, mode: 'perOpponent', stake: 100 }).balances).toEqual({ a: 100, b: -100 });
    expect(scoreStrokePlay(ctx, { net: true, mode: 'perOpponent', stake: 100 }).balances).toEqual({ a: -100, b: 100 });
  });

  it('mid-round compares only holes both players finished', () => {
    const ctx = makeCtx(['a', 'b'], parCard(['a', 'b'], { a: { 1: 3 } }, 3));
    ctx.gross.b[2] = null; // b missing hole 3
    ctx.gross.a[2] = 9; // a blew up hole 3, but b has no score to compare
    const r = scoreStrokePlay(ctx, { net: false, mode: 'perStroke', stake: 100 });
    expect(r.balances).toEqual({ a: 100, b: -100 });
    expect(sum(r.balances)).toBe(0);
  });
});
