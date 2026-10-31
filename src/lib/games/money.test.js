import { describe, it, expect } from 'vitest';
import { splitByWeight, formatMoney, dollarsToCents, payTeamBet, emptyBalances } from './money.js';

describe('splitByWeight', () => {
  it('never loses or invents a cent', () => {
    expect(splitByWeight(1000, ['a', 'b', 'c'], { a: 1, b: 1, c: 1 })).toEqual({ a: 334, b: 333, c: 333 });
    expect(splitByWeight(2000, ['a', 'b', 'c'], { a: 2, b: 1, c: 0 })).toEqual({ a: 1333, b: 667, c: 0 });
    for (let total = 0; total < 500; total += 7) {
      const s = splitByWeight(total, ['a', 'b', 'c', 'd'], { a: 3, b: 5, c: 1, d: 2 });
      expect(Object.values(s).reduce((x, y) => x + y, 0)).toBe(total);
    }
  });

  it('zero weights split nothing', () => {
    expect(splitByWeight(1000, ['a', 'b'], { a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });

  it('ties in remainder go by player order', () => {
    expect(splitByWeight(1, ['x', 'y'], { x: 1, y: 1 })).toEqual({ x: 1, y: 0 });
  });
});

describe('payTeamBet', () => {
  it('pays each winner and charges each loser', () => {
    const b = emptyBalances(['a', 'b', 'c', 'd']);
    payTeamBet(b, ['a', 'b'], ['c', 'd'], 500);
    expect(b).toEqual({ a: 500, b: 500, c: -500, d: -500 });
  });

  it('rejects uneven sides', () => {
    expect(() => payTeamBet(emptyBalances(['a', 'b', 'c']), ['a'], ['b', 'c'], 1)).toThrow();
  });
});

describe('formatting', () => {
  it('formats cents', () => {
    expect(formatMoney(1400)).toBe('$14');
    expect(formatMoney(1450)).toBe('$14.50');
    expect(formatMoney(5)).toBe('$0.05');
    expect(formatMoney(-250)).toBe('-$2.50');
    expect(formatMoney(250, { signed: true })).toBe('+$2.50');
    expect(formatMoney(0, { signed: true })).toBe('$0');
  });

  it('parses dollars without float drift', () => {
    expect(dollarsToCents('0.29')).toBe(29);
    expect(dollarsToCents(1.15)).toBe(115);
    expect(dollarsToCents('abc')).toBe(0);
  });
});
