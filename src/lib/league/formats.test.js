import { describe, it, expect } from 'vitest';
import { PARS, HCPS } from '../games/test-helpers.js';
import { computeEvent, matchFormat, teamHandicap } from './event.js';
import { leagueSettings } from './format.js';

const course = { holes: PARS.map((par, i) => ({ par, hcp: HCPS[i] })), tee: { rating: 72, slope: 113 } };
const card = (overrides = {}, played = 18) => PARS.map((par, i) => (i >= played ? null : overrides[i + 1] ?? par));
const mem = (id, team, index = 0) => ({ id, name: id.toUpperCase(), index, team });
const members = [mem('a', 'USA'), mem('b', 'USA'), mem('c', 'Europe'), mem('d', 'Europe')];
const ryder = (net = false) => leagueSettings({ kind: 'tournament', unit: 'ryder', net });
const play = (format, scores, settings = ryder()) =>
  computeEvent({ settings, event: { course, matchups: [{ sides: [['a', 'b'], ['c', 'd']], format }] }, members, scores }).matches[0];

describe('match formats', () => {
  it('defaults: one player a side is singles, two is four-ball', () => {
    expect(matchFormat({ sides: [['a'], ['c']] })).toBe('singles');
    expect(matchFormat({ sides: [['a', 'b'], ['c', 'd']] })).toBe('fourball');
    expect(matchFormat({ sides: [['a', 'b'], ['c', 'd']], format: 'shamble' })).toBe('shamble');
  });

  it('four-ball: the best ball wins the hole', () => {
    // hole 1: a birdie, b double; c, d par -> USA wins with the best ball
    const m = play('fourball', { a: card({ 1: 3 }), b: card({ 1: 6 }), c: card(), d: card() });
    expect(m.results[0]).toBe(1);
    expect(m.result).toBe('A');
  });

  it('shamble, both count: the same hole is lost when the partner blows up', () => {
    // USA 3 + 6 = 9 vs Europe 4 + 4 = 8 -> Europe wins hole 1
    const m = play('shamble', { a: card({ 1: 3 }), b: card({ 1: 6 }), c: card(), d: card() });
    expect(m.results[0]).toBe(-1);
    expect(m.result).toBe('B');
    expect(m.status.up).toBe(-1);
  });

  it('scramble: one team score per hole, from either partner’s card', () => {
    // USA's team score is saved on a's card only; Europe on both cards
    const usa = card({ 1: 3, 2: 3 });
    const m = play('scramble', { a: usa, c: card({ 2: 3 }), d: card({ 2: 3 }) });
    expect(m.teamBall).toBe(true);
    expect(m.results.slice(0, 3)).toEqual([1, 0, 0]);
    expect(m.result).toBe('A');
  });

  it('foursomes scores like a scramble', () => {
    const m = play('foursomes', { b: card({ 5: 3 }), c: card(), d: card() });
    expect(m.results[4]).toBe(1);
  });
});

describe('team handicaps for one-ball formats', () => {
  it('scramble 35% low + 15% high; foursomes half the total', () => {
    expect(teamHandicap('scramble', [10, 20])).toBe(7); // 3.5 + 3 = 6.5 -> 7
    expect(teamHandicap('scramble', [4, 4])).toBe(2); // 1.4 + 0.6 = 2
    expect(teamHandicap('foursomes', [10, 20])).toBe(15);
    expect(teamHandicap('foursomes', [9, 10])).toBe(10); // 9.5 -> 10
  });

  it('net scramble gives the team strokes off the low team', () => {
    // USA indexes 10 & 20 -> team 7. Europe scratch -> 0. Off the low: USA gets 7.
    const mixed = [mem('a', 'USA', 10), mem('b', 'USA', 20), mem('c', 'Europe'), mem('d', 'Europe')];
    const r = computeEvent({
      settings: ryder(true),
      event: { course, matchups: [{ sides: [['a', 'b'], ['c', 'd']], format: 'scramble' }] },
      members: mixed,
      scores: { a: card(Object.fromEntries(PARS.map((p, i) => [i + 1, p + 1]))), c: card(), d: card() },
    });
    const m = r.matches[0];
    expect(m.strokes.a.reduce((x, y) => x + y, 0)).toBe(7);
    expect(m.strokes.b).toEqual(m.strokes.a);
    expect(m.strokes.c.every((s) => s === 0)).toBe(true);
    // bogeys everywhere: net par on the 7 stroke holes (halved), lose the other 11
    expect(m.result).toBe('B');
  });

  it('shamble uses each player’s own strokes', () => {
    const mixed = [mem('a', 'USA', 18), mem('b', 'USA'), mem('c', 'Europe'), mem('d', 'Europe')];
    const r = computeEvent({
      settings: ryder(true),
      event: { course, matchups: [{ sides: [['a', 'b'], ['c', 'd']], format: 'shamble' }] },
      members: mixed,
      scores: { a: card({ 1: 5 }), b: card(), c: card(), d: card() },
    });
    // a's bogey on 1 is net par with a stroke: 4 + 4 = 8 vs 8 halved; a's
    // stroke turns every other par into a net birdie: USA wins
    expect(r.matches[0].results[0]).toBe(0);
    expect(r.matches[0].result).toBe('A');
  });
});

describe('mixed formats over a Ryder Cup tournament', () => {
  it('each round keeps its own format and points add up', async () => {
    const { computeLeague } = await import('./season.js');
    const events = [
      { id: 'r1', date: '1', status: 'final', course, matchups: [{ sides: [['a', 'b'], ['c', 'd']], format: 'scramble' }] },
      { id: 'r2', date: '2', status: 'final', course, matchups: [{ sides: [['a', 'b'], ['c', 'd']], format: 'shamble' }] },
      { id: 'r3', date: '3', status: 'final', course, matchups: [{ sides: [['a'], ['c']] }, { sides: [['b'], ['d']] }] },
    ];
    const scores = {
      r1: { a: card({ 1: 3 }), c: card() }, // USA scramble win
      r2: { a: card({ 1: 3 }), b: card({ 1: 6 }), c: card(), d: card() }, // Europe shamble win
      r3: { a: card(), b: card(), c: card(), d: card({ 9: 3 }) }, // a-c halved, Europe wins b-d
    };
    const { standings } = computeLeague({ settings: ryder(), members, events, scores });
    const usa = standings.find((r) => r.key === 'USA');
    const eur = standings.find((r) => r.key === 'Europe');
    expect(usa.rounds).toEqual([1, 0, 0.5]);
    expect(eur.rounds).toEqual([0, 1, 1.5]);
    expect([usa.total, eur.total]).toEqual([1.5, 2.5]);
  });
});
