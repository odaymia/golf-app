import { describe, it, expect } from 'vitest';
import { scoreVegas, teamNumber } from './vegas.js';
import { makeCtx, parCard } from './test-helpers.js';

const ids = ['a', 'b', 'c', 'd'];
const teams = [
  ['a', 'b'],
  ['c', 'd'],
];

function vegas(overrides, opts = {}, played = 18) {
  const ctx = makeCtx(ids, parCard(ids, overrides, played));
  return scoreVegas(ctx, { net: false, stake: 10, teams, birdieFlip: true, ...opts });
}

describe('teamNumber', () => {
  it('low score first', () => {
    expect(teamNumber(5, 4)).toBe(45);
    expect(teamNumber(4, 4)).toBe(44);
  });
  it('double digits go first', () => {
    expect(teamNumber(4, 10)).toBe(104);
    expect(teamNumber(11, 10)).toBe(1110);
  });
  it('flipped puts the high score first', () => {
    expect(teamNumber(4, 5, true)).toBe(54);
    expect(teamNumber(4, 4, true)).toBe(44);
  });
});

describe('vegas scoring', () => {
  it('difference in team numbers is the points', () => {
    // hole 1 par 4: a 4, b 5 -> 45; c 4, d 4 -> 44. Team 2 wins 1 point.
    const r = vegas({ b: { 1: 5 } });
    expect(r.holes[0]).toMatchObject({ numbers: [45, 44], points: -1 });
    expect(r.points).toBe(-1);
    expect(r.balances).toEqual({ a: -10, b: -10, c: 10, d: 10 });
  });

  it('a blow-up hole costs a lot', () => {
    // a 4, b 10 -> 104 vs 44: 60 points
    const r = vegas({ b: { 1: 10 } });
    expect(r.points).toBe(-60);
    expect(r.balances.c).toBe(600);
  });

  it('birdie flips the other team', () => {
    // a 3, b 4 -> 34. c 4, d 5 would be 45, flipped to 54. 20 points.
    const r = vegas({ a: { 1: 3 }, d: { 1: 5 } });
    expect(r.holes[0]).toMatchObject({ numbers: [34, 54], flipped: [false, true], points: 20 });
  });

  it('no flip when the flip rule is off', () => {
    const r = vegas({ a: { 1: 3 }, d: { 1: 5 } }, { birdieFlip: false });
    expect(r.holes[0].numbers).toEqual([34, 45]);
    expect(r.points).toBe(11);
  });

  it('both teams birdie: nobody flips', () => {
    const r = vegas({ a: { 1: 3 }, c: { 1: 3 }, d: { 1: 5 } });
    expect(r.holes[0]).toMatchObject({ numbers: [34, 35], flipped: [false, false], points: 1 });
  });

  it('flip only matters when it changes the number', () => {
    // c and d both par: 44 flipped is still 44
    const r = vegas({ a: { 1: 3 } });
    expect(r.holes[0].numbers).toEqual([34, 44]);
  });

  it('points add up across holes and pay per player per point', () => {
    const r = vegas({ a: { 1: 3 }, c: { 2: 3 }, b: { 3: 4 } }, { stake: 25 });
    // h1: 34 vs 44 -> +10. h2: 44 flipped(44) vs 34 -> -10. h3 par 3: a3,b4=34 vs 33 -> -1
    expect(r.points).toBe(-1);
    expect(r.balances).toEqual({ a: -25, b: -25, c: 25, d: 25 });
  });

  it('net vegas uses strokes and counts net birdies', () => {
    const strokes = Object.fromEntries(ids.map((id) => [id, Array(18).fill(0)]));
    strokes.a[0] = 1; // a's par is a net birdie
    const ctx = makeCtx(ids, parCard(ids, { d: { 1: 5 } }), strokes);
    const r = scoreVegas(ctx, { net: true, stake: 10, teams, birdieFlip: true });
    expect(r.holes[0].numbers).toEqual([34, 54]);
  });

  it('skips unscored holes', () => {
    const r = vegas({}, {}, 2);
    expect(r.holes[2].result).toBe('not scored');
    expect(r.points).toBe(0);
  });

  it('needs two teams of two', () => {
    const ctx = makeCtx(ids, parCard(ids));
    expect(() => scoreVegas(ctx, { teams: [['a'], ['b', 'c', 'd']], stake: 1 })).toThrow();
  });
});
