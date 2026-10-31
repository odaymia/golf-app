import { describe, it, expect } from 'vitest';
import { computeRound } from './round.js';
import { settle } from './settle.js';
import { PARS, HCPS, parCard } from './test-helpers.js';

const ids = ['a', 'b', 'c', 'd'];

function baseRound(scores, games, extra = {}) {
  return {
    course: { name: 'Test CC', holes: PARS.map((par, h) => ({ par, hcp: HCPS[h] })) },
    tee: { name: 'White', rating: 72, slope: 113 },
    players: ids.map((id) => ({ id, name: id.toUpperCase(), index: 0 })),
    handicap: { allowance: 100, offLow: false },
    games,
    scores,
    ...extra,
  };
}

// Pars everywhere except: A birdies 1, C birdies 10, D bogeys 18.
const scores = parCard(ids, { a: { 1: 3 }, c: { 10: 3 }, d: { 18: 5 } });
const allPartnerPushes = Object.fromEntries(
  Array.from({ length: 18 }, (_, i) => [i + 1, { partner: ids[(i + 2) % 4] }]),
);

const games = [
  { id: 'skins', type: 'skins', net: false, carryover: true, validate: false, mode: 'perSkin', stake: 100 },
  {
    id: 'nassau',
    type: 'nassau',
    net: false,
    stakes: { front: 500, back: 500, overall: 500 },
    autoPress: 2,
    matchups: [[['a', 'b'], ['c', 'd']]],
    presses: [],
  },
  { id: 'vegas', type: 'vegas', net: false, stake: 10, teams: [['a', 'b'], ['c', 'd']], birdieFlip: true },
  {
    id: 'wolf',
    type: 'wolf',
    net: false,
    stake: 100,
    loneMult: 2,
    blindMult: 3,
    order: ids,
    decisions: { ...allPartnerPushes, 1: { lone: true }, 10: { partner: 'c' }, 18: { partner: 'd' } },
  },
  { id: 'stroke', type: 'stroke', net: false, mode: 'perOpponent', stake: 200 },
  { id: 'match', type: 'match', net: false, stake: 500, matchups: [[['a'], ['b']]] },
];

describe('full round, every game', () => {
  const result = computeRound(baseRound(scores, games));
  const byId = Object.fromEntries(result.games.map((g) => [g.game.id, g.balances]));

  it('each game matches the hand-worked numbers', () => {
    // Skins: A 1 skin (hole 1), C 9 skins (holes 2-10), holes 11-18 unwon.
    expect(byId.skins).toEqual({ a: -600, b: -1000, c: 2600, d: -1000 });
    // Nassau: AB win front, CD win back, overall halved.
    expect(byId.nassau).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    // Vegas: +10 (h1, flip), -10 (h10, flip), +1 (h18: 44 vs 45).
    expect(byId.vegas).toEqual({ a: 10, b: 10, c: -10, d: -10 });
    // Wolf: A lone wins h1 (x2 from 3), B+C win h10, h18 push.
    expect(byId.wolf).toEqual({ a: 500, b: -100, c: -100, d: -300 });
    // Stroke: A 71, B 72, C 71, D 73.
    expect(byId.stroke).toEqual({ a: 400, b: -200, c: 400, d: -600 });
    // Match: A beats B 1 up.
    expect(byId.match).toEqual({ a: 500, b: -500, c: 0, d: 0 });
  });

  it('totals and payments', () => {
    expect(result.totals).toEqual({ a: 810, b: -1790, c: 2890, d: -1910 });
    expect(result.finished).toBe(true);
    expect(result.holesComplete).toBe(18);
    expect(result.payments).toHaveLength(3);
    const after = { ...result.totals };
    for (const p of result.payments) {
      after[p.from] += p.cents;
      after[p.to] -= p.cents;
    }
    expect(after).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });
});

describe('round handicaps', () => {
  it('strokes off the low man with an allowance', () => {
    const round = baseRound(parCard(ids), [], {
      players: [
        { id: 'a', name: 'A', index: 2 },
        { id: 'b', name: 'B', index: 10 },
        { id: 'c', name: 'C', index: 20 },
        { id: 'd', name: 'D', index: 30 },
      ],
      tee: { name: 'Blue', rating: 73.5, slope: 131 },
      handicap: { allowance: 90, offLow: true },
    });
    const r = computeRound(round);
    // CH: 2*131/113+1.5=3.82->4, 10->13.09->13, 20->24.69->25, 30->36.28->36
    // 90%: 3.6->4, 11.7->12, 22.5->23, 32.4->32; off low 4
    expect(r.playing).toEqual({ a: 0, b: 8, c: 19, d: 28 });
    expect(r.strokes.d.reduce((s, x) => s + x, 0)).toBe(28);
    expect(r.strokes.d[4]).toBe(2); // #1 handicap hole gets the second stroke
  });

  it('net games flip with handicaps', () => {
    const round = baseRound(parCard(ids, { b: { 5: 5 } }), [
      { id: 's', type: 'skins', net: true, carryover: false, mode: 'perSkin', stake: 100 },
    ], {
      players: ids.map((id) => ({ id, name: id, index: id === 'b' ? 1 : 0 })),
    });
    // b bogeys hole 5 (#1 hcp) but gets a stroke: net par, no skin either way
    const r = computeRound(round);
    expect(r.totals).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('a partial round still settles exactly', () => {
    const partial = parCard(ids, { a: { 1: 3 }, b: { 2: 3 } }, 5);
    const r = computeRound(baseRound(partial, games.filter((g) => g.id !== 'wolf')));
    expect(r.finished).toBe(false);
    expect(r.holesComplete).toBe(5);
    expect(Object.values(r.totals).reduce((s, x) => s + x, 0)).toBe(0);
    expect(settle(r.totals, ids)).toEqual(r.payments);
  });

  it('rejects unknown games', () => {
    expect(() => computeRound(baseRound(scores, [{ id: 'x', type: 'bingo' }]))).toThrow(/Unknown game/);
  });
});
