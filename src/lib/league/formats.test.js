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

describe('scorecard data', () => {
  it('team score per hole and the running margin', () => {
    // shamble: hole 1 USA 3+6=9 vs 8 (Europe wins), hole 2 USA 3+4=7 vs 8 (USA wins)
    const m = play('shamble', { a: card({ 1: 3, 2: 3 }), b: card({ 1: 6 }), c: card(), d: card() });
    expect(m.sideScores[0].slice(0, 3)).toEqual([9, 7, 6]); // hole 3 is a par 3
    expect(m.sideScores[1].slice(0, 3)).toEqual([8, 8, 6]);
    expect(m.running.slice(0, 3)).toEqual([-1, 0, 0]);
    expect(m.running[17]).toBe(0);
  });

  it('running margin stops at the closeout', () => {
    const won = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, PARS[i] - 1]));
    const m = play('fourball', { a: card(won), b: card(), c: card(), d: card() });
    // 10 up after 10 with 8 left: closed out on hole 10
    expect(m.status.played).toBe(10);
    expect(m.running[9]).toBe(10);
    expect(m.running[10]).toBe(null);
  });
});

describe('split rounds: different formats over different holes', () => {
  const split = (matchups, scores, settings = ryder()) =>
    computeEvent({ settings, event: { course, matchups }, members, scores });

  it('a match over holes 13–18 only counts those holes', () => {
    // USA birdies hole 1 (outside the match) and hole 13 (inside it)
    const m = split([{ sides: [['a'], ['c']], format: 'singles', holes: [13, 18] }], { a: card({ 1: PARS[0] - 1, 13: PARS[12] - 1 }), c: card() }).matches[0];
    expect(m.range).toEqual([12, 17]);
    expect(m.results[0]).toBe(null);
    expect(m.results[12]).toBe(1);
    expect(m.status.played).toBe(6);
    expect(m.status.remaining).toBe(0);
    expect(m.result).toBe('A');
    expect(m.running[11]).toBe(null);
    expect(m.running[12]).toBe(1);
    expect(m.running[17]).toBe(1);
  });

  it('closes out inside its stretch: 3 up with 2 to play on a 6-hole match', () => {
    const won = { 1: PARS[0] - 1, 2: PARS[1] - 1, 3: PARS[2] - 1 };
    const m = split([{ sides: [['a', 'b'], ['c', 'd']], format: 'fourball', holes: [1, 6] }], { a: card(won, 4), b: card({}, 4), c: card({}, 4), d: card({}, 4) }).matches[0];
    expect(m.status.played).toBe(4);
    expect(m.status.closedOut).toBe(true);
    expect(m.result).toBe('A');
  });

  it('each stretch is its own point: scramble 1–6, four-ball 7–12, two singles 13–18', () => {
    const matchups = [
      { sides: [['a', 'b'], ['c', 'd']], format: 'scramble', holes: [1, 6], set: 1 },
      { sides: [['a', 'b'], ['c', 'd']], format: 'fourball', holes: [7, 12], set: 1 },
      { sides: [['a'], ['c']], format: 'singles', holes: [13, 18], set: 1 },
      { sides: [['b'], ['d']], format: 'singles', holes: [13, 18], set: 1 },
    ];
    // USA wins the scramble (birdie on 1, team score on a's card), Europe the
    // four-ball (birdie on 7), a beats c (birdie on 13), b and d halve.
    const scores = {
      a: card({ 1: PARS[0] - 1, 13: PARS[12] - 1 }),
      b: card(),
      c: card({ 7: PARS[6] - 1 }),
      d: card(),
    };
    const r = split(matchups, scores);
    expect(r.matches.map((m) => m.result)).toEqual(['A', 'B', 'A', 'halved']);
    expect(r.cup).toEqual({ USA: 2.5, Europe: 1.5 });
    expect(r.matches[0].teamBall).toBe(true);
    expect(r.matches[2].set).toBe(1);
  });
});
