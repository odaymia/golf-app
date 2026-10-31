import { describe, it, expect } from 'vitest';
import {
  roundHandicap,
  courseHandicap,
  playingHandicaps,
  strokesOnHole,
  strokeTable,
} from './handicap.js';
import { HCPS, PARS } from './test-helpers.js';

const holes = PARS.map((par, h) => ({ par, hcp: HCPS[h] }));

describe('courseHandicap', () => {
  it('applies slope and rating minus par', () => {
    // 10.4 * 125/113 + (71.2 - 72) = 10.70
    expect(courseHandicap(10.4, 125, 71.2, 72)).toBe(11);
    expect(courseHandicap(0, 113, 72, 72)).toBe(0);
    expect(courseHandicap(18, 113, 72, 72)).toBe(18);
    // 24.6 * 140/113 + (74.1 - 72) = 32.58
    expect(courseHandicap(24.6, 140, 74.1, 72)).toBe(33);
  });

  it('handles plus handicaps (negative index)', () => {
    // -2.1 * 130/113 + 1 = -1.42
    expect(courseHandicap(-2.1, 130, 73, 72)).toBe(-1);
    expect(courseHandicap(-4, 113, 72, 72)).toBe(-4);
  });

  it('rounds .5 away from zero', () => {
    expect(courseHandicap(5, 113, 72.5, 72)).toBe(6);
    expect(courseHandicap(-1, 113, 71.5, 72)).toBe(-2);
    // float noise from slope math should not flip a .5 down
    expect(roundHandicap(14.4999999999)).toBe(15);
    expect(roundHandicap(14.49)).toBe(14);
    expect(roundHandicap(2.5)).toBe(3);
    expect(roundHandicap(-2.5)).toBe(-3);
    expect(roundHandicap(0)).toBe(0);
  });
});

describe('playingHandicaps', () => {
  const tee = { rating: 72, slope: 113 };
  const players = [
    { id: 'a', index: 4 },
    { id: 'b', index: 12 },
    { id: 'c', index: 15 },
    { id: 'd', index: 22 },
  ];

  it('full handicap by default', () => {
    expect(playingHandicaps(players, tee, 72)).toEqual({ a: 4, b: 12, c: 15, d: 22 });
  });

  it('percentage allowance, rounded', () => {
    // 80%: 3.2, 9.6, 12, 17.6
    expect(playingHandicaps(players, tee, 72, { allowance: 80 })).toEqual({ a: 3, b: 10, c: 12, d: 18 });
    // 85% of 15 = 12.75 -> 13
    expect(playingHandicaps([{ id: 'x', index: 15 }], tee, 72, { allowance: 85 })).toEqual({ x: 13 });
  });

  it('strokes off the low man', () => {
    expect(playingHandicaps(players, tee, 72, { offLow: true })).toEqual({ a: 0, b: 8, c: 11, d: 18 });
  });

  it('allowance then off the low man', () => {
    expect(playingHandicaps(players, tee, 72, { allowance: 80, offLow: true })).toEqual({
      a: 0,
      b: 7,
      c: 9,
      d: 15,
    });
  });

  it('off the low man with a plus player gives everyone more', () => {
    const r = playingHandicaps([{ id: 'p', index: -2 }, { id: 'q', index: 10 }], tee, 72, { offLow: true });
    expect(r).toEqual({ p: 0, q: 12 });
  });

  it('treats blank index as scratch', () => {
    expect(playingHandicaps([{ id: 'z', index: '' }], tee, 72)).toEqual({ z: 0 });
  });
});

describe('strokesOnHole', () => {
  it('0 handicap gets nothing', () => {
    for (let hcp = 1; hcp <= 18; hcp++) expect(strokesOnHole(0, hcp)).toBe(0);
  });

  it('5 handicap gets strokes on the 5 hardest holes', () => {
    expect([1, 2, 3, 4, 5].map((h) => strokesOnHole(5, h))).toEqual([1, 1, 1, 1, 1]);
    expect(strokesOnHole(5, 6)).toBe(0);
    expect(strokesOnHole(5, 18)).toBe(0);
  });

  it('18 = one per hole, 20 = two on the 2 hardest', () => {
    expect(strokesOnHole(18, 18)).toBe(1);
    expect(strokesOnHole(20, 1)).toBe(2);
    expect(strokesOnHole(20, 2)).toBe(2);
    expect(strokesOnHole(20, 3)).toBe(1);
  });

  it('36+ handicaps', () => {
    expect(strokesOnHole(36, 18)).toBe(2);
    expect(strokesOnHole(40, 4)).toBe(3);
    expect(strokesOnHole(40, 5)).toBe(2);
  });

  it('plus handicaps give strokes back on the easiest holes', () => {
    expect(strokesOnHole(-2, 18)).toBe(-1);
    expect(strokesOnHole(-2, 17)).toBe(-1);
    expect(strokesOnHole(-2, 16)).toBe(0);
    expect(strokesOnHole(-2, 1)).toBe(0);
  });

  it('strokes across the card always add up to the handicap', () => {
    for (let ph = -10; ph <= 54; ph++) {
      const total = strokeTable({ p: ph }, holes).p.reduce((s, x) => s + x, 0);
      expect(total).toBe(ph);
    }
  });

  it('strokeTable maps by hole handicap, not hole number', () => {
    const t = strokeTable({ p: 1 }, holes).p;
    // hole 5 is the #1 handicap hole
    expect(t[4]).toBe(1);
    expect(t.filter((s) => s === 1)).toHaveLength(1);
  });
});

describe('no negative zero', () => {
  it('rounds tiny plus values to a clean 0', () => {
    expect(Object.is(roundHandicap(-0.2), 0)).toBe(true);
  });
});
