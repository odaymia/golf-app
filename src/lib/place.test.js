import { describe, it, expect } from 'vitest';
import { PLACE_MAX_AGE_MS, readPlace, writePlace } from './place.js';
import { roundToPlay } from './league/groups.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

describe('remembering where the player is', () => {
  it('comes back after the app is closed, until it is old', () => {
    const s = memory();
    writePlace({ leagueId: 'L1', eventId: 'E1', tab: 'score' }, s, 1000);
    expect(readPlace(s, 2000)).toMatchObject({ leagueId: 'L1', eventId: 'E1', tab: 'score' });
    expect(readPlace(s, 1000 + PLACE_MAX_AGE_MS + 1)).toBe(null);
    writePlace(null, s);
    expect(readPlace(s, 2000)).toBe(null);
  });
  it('ignores junk', () => {
    const s = memory();
    s.setItem('golf-app:place', '{bad');
    expect(readPlace(s)).toBe(null);
  });
});

describe('which round Play opens', () => {
  const ev = (id, date, extra = {}) => ({ id, date, status: 'scheduled', groups: [], matchups: [], ...extra });
  it("today's round I'm grouped in", () => {
    const events = [ev('r1', '2026-11-20', { status: 'final' }), ev('r2', '2026-11-22', { groups: [['me', 'a'], ['b', 'c']] }), ev('r3', '2026-11-23')];
    expect(roundToPlay(events, 'me', '2026-11-22').id).toBe('r2');
    expect(roundToPlay(events, 'b', '2026-11-22').id).toBe('r2');
    expect(roundToPlay(events, 'zed', '2026-11-22')).toBe(null); // not in a group today
  });
  it('a round that started earlier and is not final yet', () => {
    const events = [ev('r1', '2026-11-20'), ev('r2', '2026-11-21'), ev('r3', '2026-11-25')];
    expect(roundToPlay(events, 'me', '2026-11-22').id).toBe('r2');
  });
  it('a match puts me in the round; nothing to play when everything is final or later', () => {
    expect(roundToPlay([ev('r1', '2026-11-22', { matchups: [{ sides: [['me'], ['x']] }] })], 'me', '2026-11-22').id).toBe('r1');
    expect(roundToPlay([ev('r1', '2026-11-20', { status: 'final' }), ev('r2', '2026-11-30')], 'me', '2026-11-22')).toBe(null);
    expect(roundToPlay([ev('r1', '2026-11-22')], null, '2026-11-22')).toBe(null);
  });
});
