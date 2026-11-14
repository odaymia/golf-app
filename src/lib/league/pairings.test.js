import { describe, it, expect } from 'vitest';
import {
  pairingOrder,
  makeGroups,
  makeSinglesMatches,
  previousEvent,
  generatedSlot,
  teeSheetRows,
  myTeeTime,
  formatTime,
  shuffle,
  normalizeTeeSheet,
} from './pairings.js';
import { leagueSettings } from './format.js';

const solo = leagueSettings({ unit: 'individual' });
const teams = leagueSettings({ unit: 'teams', teamSize: 2 });
const P = (id, name, team) => ({ id, name, team });
const players = [P('a', 'Al'), P('b', 'Bo'), P('c', 'Cy'), P('d', 'Di'), P('e', 'Ed')];
// Season: b 1st, d 2nd, a 3rd, c 4th; e has no position yet.
const standings = [
  { key: 'b', position: 1 },
  { key: 'd', position: 2 },
  { key: 'a', position: 3 },
  { key: 'c', position: 4 },
  { key: 'e', position: null },
];

// Seeded random so draws are repeatable.
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe('pairing order', () => {
  it('manual keeps the roster order', () => {
    expect(pairingOrder({ method: 'manual', players, settings: solo })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('standings, leaders first: 1st in group 1, unranked at the end', () => {
    expect(pairingOrder({ method: 'standings', direction: 'leaders-first', players, settings: solo, standings })).toEqual([
      'b', 'd', 'a', 'c', 'e',
    ]);
  });

  it('standings, leaders last: last place goes off first, leader last; unranked still go first', () => {
    expect(pairingOrder({ method: 'standings', direction: 'leaders-last', players, settings: solo, standings })).toEqual([
      'e', 'c', 'a', 'd', 'b',
    ]);
  });

  it('last round: by finish, missing players after in standings order', () => {
    const lastBoard = [
      { key: 'c', position: 1 },
      { key: 'a', position: 2 },
      { key: 'd', position: 2 },
    ];
    // a and d tie on the last round: season standings break it (d 2nd, a 3rd).
    // b and e didn't play: b (1st in season) before e.
    expect(pairingOrder({ method: 'last', direction: 'leaders-first', players, settings: solo, standings, lastBoard })).toEqual([
      'c', 'd', 'a', 'b', 'e',
    ]);
  });

  it('random is a permutation and repeatable with a seed', () => {
    const one = pairingOrder({ method: 'random', players, settings: solo, random: seeded(7) });
    const two = pairingOrder({ method: 'random', players, settings: solo, random: seeded(7) });
    expect(one).toEqual(two);
    expect([...one].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('teams stay together, ordered by team finish', () => {
    const tp = [P('a', 'Al', 'Hawks'), P('b', 'Bo', 'Eagles'), P('c', 'Cy', 'Hawks'), P('d', 'Di', 'Eagles'), P('e', 'Ed', 'Owls'), P('f', 'Fy', 'Owls')];
    const ts = [{ key: 'Eagles', position: 1 }, { key: 'Owls', position: 2 }, { key: 'Hawks', position: 3 }];
    expect(pairingOrder({ method: 'standings', direction: 'leaders-first', players: tp, settings: teams, standings: ts })).toEqual([
      'b', 'd', 'e', 'f', 'a', 'c',
    ]);
    expect(pairingOrder({ method: 'standings', direction: 'leaders-last', players: tp, settings: teams, standings: ts })).toEqual([
      'a', 'c', 'e', 'f', 'b', 'd',
    ]);
    const drawn = pairingOrder({ method: 'random', players: tp, settings: teams, random: seeded(3) });
    const team = Object.fromEntries(tp.map((m) => [m.id, m.team]));
    for (let i = 0; i < 6; i += 2) expect(team[drawn[i]]).toBe(team[drawn[i + 1]]);
  });

  it('shuffle never loses anyone', () => {
    const list = Array.from({ length: 30 }, (_, i) => i);
    expect(shuffle(list, seeded(11)).sort((x, y) => x - y)).toEqual(list);
  });
});

describe('groups and matches', () => {
  it('evens out groups', () => {
    expect(makeGroups(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']).map((g) => g.length)).toEqual([4, 3, 3]);
  });

  it('never splits a two-man team', () => {
    const order = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2', 'e1', 'e2'];
    const groups = makeGroups(order, 4, (id) => id[0]);
    expect(groups).toEqual([['a1', 'a2', 'b1', 'b2'], ['c1', 'c2', 'd1', 'd2'], ['e1', 'e2']]);
  });

  it('keeps whole matches together; a lone bye joins a group with room', () => {
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const matchOf = (id) => (id === 'i' ? 'bye' : Math.floor(order.indexOf(id) / 2));
    // Threesomes can't hold two matches: one match per group, the bye joins the last.
    expect(makeGroups(order, 3, matchOf)).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h', 'i']]);
    expect(makeGroups(order, 4, matchOf)).toEqual([['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h'], ['i']]);
  });

  it('singles: neighbours play, odd player gets a bye', () => {
    expect(makeSinglesMatches(['b', 'd', 'a', 'c', 'e'])).toEqual({
      matchups: [
        { sides: [['b'], ['d']], format: 'singles' },
        { sides: [['a'], ['c']], format: 'singles' },
      ],
      bye: 'e',
    });
  });

  it('previous round by date', () => {
    const events = [
      { id: 'x', date: '2026-05-01' },
      { id: 'y', date: '2026-05-08' },
      { id: 'z', date: '2026-05-15' },
    ];
    expect(previousEvent(events, events[2]).id).toBe('y');
    expect(previousEvent(events, events[0])).toBe(null);
  });
});

describe('tee sheet', () => {
  it('tee times every interval', () => {
    const sheet = { mode: 'tee', start: '07:52', interval: 9 };
    expect([0, 1, 2].map((i) => generatedSlot(sheet, i, 3))).toEqual(['07:52', '08:01', '08:10']);
    expect(generatedSlot({ mode: 'tee', start: '12:55', interval: 10 }, 1, 2)).toBe('13:05');
  });

  it('shotgun: one group a hole, then A/B on the first holes', () => {
    const sheet = { mode: 'shotgun', start: '13:00' };
    expect([0, 1, 2].map((i) => generatedSlot(sheet, i, 3))).toEqual(['1', '2', '3']);
    // 20 groups on 18 holes: holes 1 and 2 take two groups.
    const twenty = Array.from({ length: 20 }, (_, i) => generatedSlot(sheet, i, 20));
    expect(twenty.slice(0, 5)).toEqual(['1A', '1B', '2A', '2B', '3']);
    expect(twenty.at(-1)).toBe('18');
    expect(new Set(twenty).size).toBe(20);
  });

  it('rows use groups, else matches, and keep edited slots', () => {
    const event = {
      groups: [['a', 'b'], ['c', 'd']],
      matchups: [],
      teeSheet: { mode: 'tee', start: '08:00', interval: 10, slots: ['', '08:30'] },
    };
    expect(teeSheetRows(event).map((r) => r.slot)).toEqual(['08:00', '08:30']);
    expect(myTeeTime(event, 'd')).toMatchObject({ index: 1, label: '8:30 AM' });
    expect(myTeeTime(event, 'z')).toBe(null);
    const matchOnly = { groups: [], matchups: [{ sides: [['a'], ['b']] }], teeSheet: { mode: 'shotgun', start: '13:30' } };
    expect(myTeeTime(matchOnly, 'b').label).toBe('Hole 1 · 1:30 PM shotgun');
  });

  it('no tee sheet, no tee times (unless previewing)', () => {
    const event = { groups: [['a', 'b']], matchups: [], teeSheet: null };
    expect(teeSheetRows(event)).toEqual([]);
    expect(myTeeTime(event, 'a')).toBe(null);
    expect(teeSheetRows(event, { preview: true })[0].slot).toBe('08:00');
  });

  it('formats and normalizes', () => {
    expect(formatTime('00:05')).toBe('12:05 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(normalizeTeeSheet({ mode: 'x', start: 'soon', interval: 0 })).toMatchObject({ mode: 'tee', start: '08:00', interval: 10 });
  });
});
