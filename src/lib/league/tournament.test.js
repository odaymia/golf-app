import { describe, it, expect } from 'vitest';
import { PARS, HCPS } from '../games/test-helpers.js';
import { computeLeague } from './season.js';
import { leagueSettings, scoringOptions, seasonOptions, describeLeague } from './format.js';

const course = { holes: PARS.map((par, i) => ({ par, hcp: HCPS[i] })), tee: { rating: 72, slope: 113 } };
const card = (overrides = {}, played = 18) => PARS.map((par, i) => (i >= played ? null : overrides[i + 1] ?? par));
const mem = (id, extra = {}) => ({ id, name: id.toUpperCase(), index: 0, ...extra });
const t = (patch) => leagueSettings({ kind: 'tournament', ...patch });

describe('tournament format', () => {
  it('stroke or stableford (or a Ryder Cup), standings are the live total', () => {
    expect(scoringOptions('individual', 'tournament')).toEqual(['stroke', 'stableford']);
    expect(scoringOptions('ryder', 'tournament')).toEqual(['match']);
    expect(seasonOptions('teams', 'stableford', 'tournament')).toEqual(['total']);
    const s = t({ scoring: 'match', rounds: 3 });
    expect([s.scoring, s.season, s.rounds]).toEqual(['stroke', 'total', 3]);
    expect(describeLeague(s)).toBe('Single players · Net stroke play · 3 rounds');
    expect(describeLeague(t({}))).toMatch(/One day/);
  });

  it('league handicap mode is not offered for tournaments', () => {
    expect(t({ handicap: { mode: 'league' } }).handicap.mode).toBe('index');
  });
});

describe('multi-round stroke play leaderboard', () => {
  const members = [mem('a'), mem('b'), mem('c'), mem('d')];
  const events = [
    { id: 'r1', date: '2026-06-01', status: 'final', course },
    { id: 'r2', date: '2026-06-02', status: 'scheduled', course },
  ];
  const scores = {
    // round 1: a -2, b E, c +1, d did not play
    r1: { a: card({ 1: 3, 2: 3 }), b: card(), c: card({ 3: 4 }) },
    // round 2 in progress: a +1 thru 9, b -3 thru 18, c E thru 4
    r2: { a: card({ 1: 5 }, 9), b: card({ 1: 3, 2: 3, 4: 4 }), c: card({}, 4) },
  };

  it('totals both rounds live, with today and thru', () => {
    const { standings } = computeLeague({ settings: t({ net: false, rounds: 2 }), members, events, scores });
    expect(standings.map((r) => [r.key, r.toPar, r.today, r.thru, r.position])).toEqual([
      ['b', -3, -3, 'F', 1],
      ['a', -1, 1, 9, 2],
      ['c', 1, 0, 4, 3],
      ['d', 0, null, null, null],
    ]);
    expect(standings[0].rounds.map((r) => r?.toPar)).toEqual([0, -3]);
    expect(standings[3].started).toBe(false);
  });

  it('ties share a position', () => {
    const { standings } = computeLeague({
      settings: t({ net: false }),
      members: [mem('a'), mem('b')],
      events: [events[0]],
      scores: { r1: { a: card({ 1: 3 }), b: card({ 2: 3 }) } },
    });
    expect(standings.map((r) => r.position)).toEqual([1, 1]);
  });

  it('net uses each round’s handicap strokes', () => {
    const { standings } = computeLeague({
      settings: t({ net: true }),
      members: [mem('a'), mem('b', { index: 18 })],
      events: [events[0]],
      scores: { r1: { a: card({ 1: 3 }), b: card(Object.fromEntries(PARS.map((p, i) => [i + 1, p + 1]))) } },
    });
    expect(standings.map((r) => [r.key, r.toPar])).toEqual([
      ['a', -1],
      ['b', 0],
    ]);
  });
});

describe('stableford and team tournaments', () => {
  it('stableford totals points across rounds, most points first', () => {
    const events = [
      { id: 'r1', date: '1', course },
      { id: 'r2', date: '2', course },
    ];
    const { standings } = computeLeague({
      settings: t({ scoring: 'stableford', net: false }),
      members: [mem('a'), mem('b')],
      events,
      scores: { r1: { a: card({ 1: 3 }), b: card() }, r2: { a: card({ 1: 6 }), b: card({ 5: 3 }) } },
    });
    // a: 37 + 34 = 71; b: 36 + 37 = 73
    expect(standings.map((r) => [r.key, r.total, r.today])).toEqual([
      ['b', 73, 37],
      ['a', 71, 34],
    ]);
  });

  it('two-player team best ball totals by team', () => {
    const members = [mem('a', { team: 'Eagles' }), mem('b', { team: 'Eagles' }), mem('c', { team: 'Hawks' }), mem('d', { team: 'Hawks' })];
    const { standings } = computeLeague({
      settings: t({ unit: 'teams', net: false }),
      members,
      events: [{ id: 'r1', date: '1', course }],
      scores: { r1: { a: card({ 1: 3 }), b: card({ 2: 3 }), c: card({ 3: 2 }), d: card() } },
    });
    expect(standings.map((r) => [r.key, r.toPar])).toEqual([
      ['Eagles', -2],
      ['Hawks', -1],
    ]);
  });
});

describe('Ryder Cup tournament', () => {
  const members = [mem('a', { team: 'USA' }), mem('b', { team: 'USA' }), mem('c', { team: 'Europe' }), mem('d', { team: 'Europe' })];
  const events = [
    // Day 1 four-ball: USA wins
    { id: 'd1', date: '1', status: 'final', course, matchups: [{ sides: [['a', 'b'], ['c', 'd']] }] },
    // Day 2 singles: a-c halved, b-d in progress with Europe 1 up
    { id: 'd2', date: '2', status: 'scheduled', course, matchups: [{ sides: [['a'], ['c']] }, { sides: [['b'], ['d']] }] },
  ];
  const scores = {
    d1: { a: card({ 1: 3 }), b: card(), c: card(), d: card() },
    d2: { a: card(), c: card(), b: card({}, 6), d: card({ 2: 3 }, 6) },
  };

  it('points per round, total, and a live projection', () => {
    const { standings } = computeLeague({ settings: t({ unit: 'ryder', net: false }), members, events, scores });
    const usa = standings.find((r) => r.key === 'USA');
    const eur = standings.find((r) => r.key === 'Europe');
    expect(usa.rounds).toEqual([1, 0.5]);
    expect(eur.rounds).toEqual([0, 0.5]);
    expect([usa.total, eur.total]).toEqual([1.5, 0.5]);
    // Europe leads the match still on the course
    expect([usa.projected, eur.projected]).toEqual([1.5, 1.5]);
    expect(standings[0].key).toBe('USA');
  });
});
