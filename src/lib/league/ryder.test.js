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
