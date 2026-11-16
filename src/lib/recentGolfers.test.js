import { describe, it, expect } from 'vitest';
import { listRecentGolfers, rememberGolfers } from './recentGolfers.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe('recent golfers', () => {
  it('newest first, no duplicates, never yourself, per account', () => {
    const s = memory();
    rememberGolfers('me', [{ id: 'a', name: 'Al', index: 5 }, { id: 'me', name: 'Me' }], s);
    rememberGolfers('me', [{ id: 'b', name: 'Bo' }, { id: 'a', name: 'Al', index: 4 }], s);
    expect(listRecentGolfers('me', s).map((g) => [g.id, g.index])).toEqual([
      ['b', null],
      ['a', 4],
    ]);
    expect(listRecentGolfers('other', s)).toEqual([]);
  });
});
