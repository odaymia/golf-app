import { describe, it, expect } from 'vitest';
import { foursomesForMatches, matchProblem, discrepancies, discrepancyHoles, othersValue, sideSize } from './ryder.js';

describe('foursomes from matches', () => {
  it('2 vs 2: each match is its own foursome', () => {
    const m = [
      { sides: [['a1', 'a2'], ['b1', 'b2']] },
      { sides: [['a3', 'a4'], ['b3', 'b4']] },
    ];
    expect(foursomesForMatches(m)).toEqual([
      ['a1', 'a2', 'b1', 'b2'],
      ['a3', 'a4', 'b3', 'b4'],
    ]);
  });
  it('singles: matches 1+2, 3+4 share a foursome; odd last match is a twosome', () => {
    const m = ['1', '2', '3', '4', '5'].map((n) => ({ sides: [[`a${n}`], [`b${n}`]] }));
    expect(foursomesForMatches(m)).toEqual([
      ['a1', 'b1', 'a2', 'b2'],
      ['a3', 'b3', 'a4', 'b4'],
      ['a5', 'b5'],
    ]);
  });
});

describe('matchProblem', () => {
  const sides = ['USA', 'Europe'];
  const team = { a1: 'USA', a2: 'USA', b1: 'Europe', b2: 'Europe' };
  const teamOf = (id) => team[id];
  it('checks sizes, teams and repeats', () => {
    expect(sideSize('fourball')).toBe(2);
    expect(matchProblem({ a: ['a1', 'a2'], b: ['b1', 'b2'], format: 'fourball', sides, teamOf, used: new Set() })).toBe(null);
    expect(matchProblem({ a: ['a1'], b: ['b1'], format: 'fourball', sides, teamOf, used: new Set() })).toMatch(/two players/);
    expect(matchProblem({ a: ['a1'], b: ['a2'], format: 'singles', sides, teamOf, used: new Set() })).toMatch(/own team/);
    expect(matchProblem({ a: ['a1'], b: ['b1'], format: 'singles', sides, teamOf, used: new Set(['b1']) })).toMatch(/one match/);
  });
});

describe('scorekeeper discrepancies', () => {
  const entries = [
    { memberId: 'p1', scorerId: 'mike', gross: [4, 5, 3, null] },
    { memberId: 'p1', scorerId: 'dave', gross: [4, 6, null, 5] },
    { memberId: 'p2', scorerId: 'mike', gross: [5, 5, 5, 5] },
  ];
  it('flags holes where scorekeepers disagree', () => {
    const d = discrepancies(entries);
    expect(d).toEqual({
      p1: {
        1: [
          { scorerId: 'mike', value: 5 },
          { scorerId: 'dave', value: 6 },
        ],
      },
    });
    expect(discrepancyHoles(d, ['p1', 'p2'])).toEqual([1]);
    expect(discrepancyHoles(d, ['p2'])).toEqual([]);
  });
  it('agreeing or one-sided holes are fine', () => {
    expect(discrepancies([{ memberId: 'x', scorerId: 'a', gross: [4] }, { memberId: 'x', scorerId: 'b', gross: [4] }])).toEqual({});
  });
  it("suggests the other scorekeeper's score when I haven't entered one", () => {
    expect(othersValue(entries, 'p1', 2, 'dave')).toBe(3); // Mike has 3, Dave nothing
    expect(othersValue(entries, 'p1', 3, 'mike')).toBe(5);
    expect(othersValue(entries, 'p1', 1, 'mike')).toBe(6);
    expect(othersValue(entries, 'p2', 0, 'mike')).toBe(null); // only my own
  });
});

import { defaultSplit, isSplit, parseSplit, resplitMatchups, splitMatchups, splitProblem, splitText } from './ryder.js';

describe('split rounds', () => {
  it('saves and reads the plan', () => {
    const segs = defaultSplit(18);
    expect(segs).toEqual([
      { from: 1, to: 6, format: 'scramble' },
      { from: 7, to: 12, format: 'fourball' },
      { from: 13, to: 18, format: 'singles' },
    ]);
    const text = splitText(segs);
    expect(text).toBe('split:1-6:scramble|7-12:fourball|13-18:singles');
    expect(isSplit(text)).toBe(true);
    expect(isSplit('fourball')).toBe(false);
    expect(parseSplit(text)).toEqual(segs);
    expect(parseSplit('split:', 9)).toEqual(defaultSplit(9));
  });

  it('checks the stretches cover every hole in order', () => {
    expect(splitProblem(defaultSplit(18), 18)).toBe(null);
    expect(splitProblem([{ from: 1, to: 9, format: 'fourball' }], 18)).toMatch(/at least two/);
    expect(splitProblem([{ from: 1, to: 6, format: 'scramble' }, { from: 8, to: 18, format: 'singles' }], 18)).toMatch(/start on hole 7/);
    expect(splitProblem([{ from: 1, to: 6, format: 'scramble' }, { from: 7, to: 15, format: 'singles' }], 18)).toMatch(/end on hole 18/);
  });

  it('makes one match per stretch, two for singles, all in one foursome', () => {
    const mus = splitMatchups(['a1', 'a2'], ['b1', 'b2'], defaultSplit(18), 7);
    expect(mus).toEqual([
      { sides: [['a1', 'a2'], ['b1', 'b2']], format: 'scramble', holes: [1, 6], set: 7 },
      { sides: [['a1', 'a2'], ['b1', 'b2']], format: 'fourball', holes: [7, 12], set: 7 },
      { sides: [['a1'], ['b1']], format: 'singles', holes: [13, 18], set: 7 },
      { sides: [['a2'], ['b2']], format: 'singles', holes: [13, 18], set: 7 },
    ]);
    expect(foursomesForMatches(mus)).toEqual([['a1', 'a2', 'b1', 'b2']]);
    // a split foursome next to ordinary singles matches
    const more = [...mus, { sides: [['a3'], ['b3']] }, { sides: [['a4'], ['b4']] }];
    expect(foursomesForMatches(more)).toEqual([['a1', 'a2', 'b1', 'b2'], ['a3', 'b3', 'a4', 'b4']]);
  });
});

describe('changing a split round with matches', () => {
  it('rebuilds each foursome with the new stretches, keeping pairs and singles pairings', () => {
    const old = splitMatchups(['a1', 'a2'], ['b1', 'b2'], defaultSplit(18), 1);
    // swap singles: a1 vs b2, a2 vs b1
    const swapped = old.map((mu) => (mu.format !== 'singles' ? mu : { ...mu, sides: [mu.sides[0], [mu.sides[1][0] === 'b1' ? 'b2' : 'b1']] }));
    const segs = [
      { from: 1, to: 6, format: 'fourball' },
      { from: 7, to: 12, format: 'singles' },
      { from: 13, to: 18, format: 'foursomes' },
    ];
    const out = resplitMatchups(swapped, segs);
    expect(out.map((mu) => [mu.format, mu.holes.join('-')])).toEqual([
      ['fourball', '1-6'],
      ['singles', '7-12'],
      ['singles', '7-12'],
      ['foursomes', '13-18'],
    ]);
    expect(out[0].sides).toEqual([['a1', 'a2'], ['b2', 'b1']]);
    expect(out[1].sides).toEqual([['a1'], ['b2']]);
    expect(out.every((mu) => mu.set === 1)).toBe(true);
  });

  it('keeps pair order when the old plan had no singles', () => {
    const old = splitMatchups(['a1', 'a2'], ['b1', 'b2'], [{ from: 1, to: 9, format: 'scramble' }, { from: 10, to: 18, format: 'fourball' }], 'x');
    const out = resplitMatchups(old, defaultSplit(18));
    expect(out.filter((mu) => mu.format === 'singles').map((mu) => mu.sides)).toEqual([[['a1'], ['b1']], [['a2'], ['b2']]]);
  });
});
