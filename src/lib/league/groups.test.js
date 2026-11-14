import { describe, it, expect } from 'vitest';
import { groupOf, canScore, autoGroups } from './groups.js';

const player = (id) => ({ id, role: 'member' });

describe('groupOf', () => {
  it('uses the commissioner’s groups first', () => {
    const ev = { groups: [['a', 'b', 'c', 'd'], ['e', 'f']], matchups: [{ sides: [['a'], ['e']] }] };
    expect(groupOf(ev, 'a')).toEqual(['a', 'b', 'c', 'd']);
    expect(groupOf(ev, 'f')).toEqual(['e', 'f']);
  });

  it('falls back to your match when no group includes you', () => {
    const ev = { groups: [], matchups: [{ sides: [['a', 'b'], ['c', 'd']] }, { sides: [['e'], ['f']] }] };
    expect(groupOf(ev, 'c')).toEqual(['a', 'b', 'c', 'd']);
    expect(groupOf(ev, 'e')).toEqual(['e', 'f']);
  });

  it('two singles matches grouped into one foursome', () => {
    const ev = { groups: [['e', 'f', 'g', 'h']], matchups: [{ sides: [['e'], ['f']] }, { sides: [['g'], ['h']] }] };
    expect(groupOf(ev, 'g')).toEqual(['e', 'f', 'g', 'h']);
  });

  it('no group and no match: just yourself', () => {
    expect(groupOf({ groups: [], matchups: [] }, 'z')).toEqual(['z']);
    expect(groupOf({}, 'z')).toEqual(['z']);
  });
});

describe('canScore', () => {
  const ev = { groups: [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']] };
  it('players score their own group only', () => {
    expect(canScore(ev, player('a'), 'd')).toBe(true);
    expect(canScore(ev, player('a'), 'e')).toBe(false);
    expect(canScore(ev, player('a'), 'a')).toBe(true);
  });
  it('commissioners score anyone; strangers no one', () => {
    expect(canScore(ev, { id: 'x', role: 'commissioner' }, 'h')).toBe(true);
    expect(canScore(ev, undefined, 'a')).toBe(false);
  });
});

describe('autoGroups', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
  it('fours, evened out at the end', () => {
    expect(autoGroups(ids(8)).map((g) => g.length)).toEqual([4, 4]);
    expect(autoGroups(ids(10)).map((g) => g.length)).toEqual([4, 3, 3]);
    expect(autoGroups(ids(13)).map((g) => g.length)).toEqual([4, 3, 3, 3]);
    expect(autoGroups(ids(3)).map((g) => g.length)).toEqual([3]);
    expect(autoGroups([])).toEqual([]);
  });
  it('keeps everyone exactly once, in order', () => {
    expect(autoGroups(ids(10)).flat()).toEqual(ids(10));
  });
});
