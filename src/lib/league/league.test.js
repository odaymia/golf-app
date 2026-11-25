import { describe, it, expect } from 'vitest';
import { PARS, HCPS } from '../games/test-helpers.js';
import { stablefordPoints, naturalBonus, holeStableford, rank, awardPoints, computeEvent } from './event.js';
import { standings, computeLeague, roundRobinWeek } from './season.js';
import { adjustedGross, differential, leagueIndexFrom, indexesByEvent, playingHandicap } from './leagueHandicap.js';
import {
  defaultLeagueSettings,
  leagueSettings,
  normalizeSettings,
  placesFor,
  presetTable,
  seasonOptions,
  scoringOptions,
  tableForTier,
} from './format.js';

const course = { holes: PARS.map((par, i) => ({ par, hcp: HCPS[i] })), tee: { rating: 72, slope: 113 } };
const card = (overrides = {}, played = 18) =>
  PARS.map((par, i) => (i >= played ? null : overrides[i + 1] ?? par));

const settings = (patch = {}) => leagueSettings(patch);
const mem = (id, extra = {}) => ({ id, name: id.toUpperCase(), index: 0, ...extra });

describe('stableford', () => {
  it('points per hole', () => {
    expect([6, 5, 4, 3, 2, 1].map((s) => stablefordPoints(s, 4))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(stablefordPoints(9, 4)).toBe(0);
  });
});

describe('custom stableford and natural bonuses', () => {
  const modified = { albatross: 8, eagle: 5, birdie: 2, par: 0, bogey: -1, double: -3 };

  it('custom tables, including negative points', () => {
    // par 5: albatross, eagle, birdie, par, bogey, quadruple bogey
    expect([2, 3, 4, 5, 6, 9].map((s) => stablefordPoints(s, 5, modified))).toEqual([8, 5, 2, 0, -1, -3]);
    expect(stablefordPoints(5, 4, modified)).toBe(-1);
  });

  it('presets fill the table; custom keeps yours', () => {
    expect(leagueSettings({ stableford: { preset: 'modified' } }).stableford.points).toEqual(modified);
    const own = { albatross: 10, eagle: 6, birdie: 4, par: 1, bogey: 0, double: -2 };
    expect(leagueSettings({ stableford: { preset: 'custom', points: own } }).stableford.points).toEqual(own);
    expect(leagueSettings({}).stableford).toMatchObject({ preset: 'standard', bonusOn: false });
  });

  it('natural bonus uses the gross score, ace replaces eagle', () => {
    const bonus = { ace: 5, albatross: 3, eagle: 2, birdie: 1 };
    expect(naturalBonus(3, 4, bonus)).toBe(1);
    expect(naturalBonus(2, 4, bonus)).toBe(2);
    expect(naturalBonus(2, 5, bonus)).toBe(3);
    expect(naturalBonus(1, 3, bonus)).toBe(5);
    expect(naturalBonus(4, 4, bonus)).toBe(0);
  });

  it('a net birdie made with a stroke earns no natural bonus', () => {
    const s = leagueSettings({ scoring: 'stableford', stableford: { preset: 'standard', bonusOn: true, bonus: { ace: 5, albatross: 3, eagle: 2, birdie: 1 } } });
    expect(holeStableford(s, 4, 1, 4)).toBe(3); // net birdie: 3, no bonus
    expect(holeStableford(s, 3, 0, 4)).toBe(4); // natural birdie: 3 + 1
    expect(holeStableford(s, 3, 1, 4)).toBe(5); // natural birdie with a stroke = net eagle 4 + 1
  });

  it('bonuses count in the event leaderboard', () => {
    const base = { scoring: 'stableford', pointsTable: [10, 5] };
    const members = [mem('a'), mem('b', { index: 18 })];
    // a: one natural birdie, pars elsewhere = 37 (+1 bonus = 38)
    // b: bogeys everywhere with a stroke each = net par = 36, plus a net birdie on 1 (gross par) = 37
    const scores = {
      a: card({ 1: 3 }),
      b: card(Object.fromEntries(PARS.map((p, i) => [i + 1, i === 0 ? p : p + 1]))),
    };
    const plain = computeEvent({ settings: settings(base), event: { course }, members, scores });
    expect(plain.board.map((e) => [e.key, e.value])).toEqual([
      ['a', 37],
      ['b', 37],
    ]);
    const withBonus = computeEvent({
      settings: settings({ ...base, stableford: { preset: 'standard', bonusOn: true, bonus: { ace: 5, albatross: 3, eagle: 2, birdie: 1 } } }),
      event: { course },
      members,
      scores,
    });
    expect(withBonus.board.map((e) => [e.key, e.value])).toEqual([
      ['a', 38],
      ['b', 37],
    ]);
  });
});

describe('ranking and points', () => {
  it('ties share a position and split the points', () => {
    const r = rank(
      [
        { key: 'a', v: 70 },
        { key: 'b', v: 72 },
        { key: 'c', v: 70 },
        { key: 'd', v: 75 },
      ],
      (x, y) => x.v - y.v,
    );
    expect(r.map((x) => [x.key, x.position])).toEqual([
      ['a', 1],
      ['c', 1],
      ['b', 3],
      ['d', 4],
    ]);
    expect(awardPoints(r, [10, 8, 6, 4])).toEqual({ a: 9, c: 9, b: 6, d: 4 });
  });

  it('three-way tie splits evenly, to the cent', () => {
    const r = rank([{ key: 'a' }, { key: 'b' }, { key: 'c' }], () => 0);
    expect(awardPoints(r, [10, 8, 5])).toEqual({ a: 7.67, b: 7.67, c: 7.67 });
  });

  it('places past the table get 0', () => {
    const r = rank([{ key: 'a', v: 1 }, { key: 'b', v: 2 }], (x, y) => x.v - y.v);
    expect(awardPoints(r, [5])).toEqual({ a: 5, b: 0 });
  });
});

describe('individual stroke play event', () => {
  const members = [mem('a'), mem('b', { index: 18 }), mem('c')];
  it('net leaderboard with handicaps, points only for finished rounds', () => {
    const r = computeEvent({
      settings: settings({ pointsTable: [10, 8, 6] }),
      event: { course },
      members,
      scores: { a: card({ 1: 3 }), b: card(Object.fromEntries(PARS.map((p, i) => [i + 1, p + 1]))), c: card({}, 9) },
    });
    // a: 71 net, b: 90 gross - 18 = 72 net, c: thru 9 at even
    expect(r.board.map((e) => [e.key, e.value, e.toPar, e.position])).toEqual([
      ['a', 71, -1, 1],
      ['b', 72, 0, 2],
      ['c', 36, 0, 2],
    ]);
    expect(r.points).toEqual({ a: 10, b: 8 });
    expect(r.board.find((e) => e.key === 'c').points).toBe(null);
  });

  it('gross ignores handicaps', () => {
    const r = computeEvent({
      settings: settings({ net: false }),
      event: { course },
      members: [mem('a', { index: 10 })],
      scores: { a: card({ 1: 5 }) },
    });
    expect(r.board[0].value).toBe(73);
  });

  it('allowance and max handicap', () => {
    const s = settings();
    s.handicap = { ...s.handicap, allowance: 80, maxHandicap: 12 };
    expect(playingHandicap(10, course, s.handicap)).toBe(8);
    expect(playingHandicap(20, course, s.handicap)).toBe(12);
  });
});

describe('stableford event', () => {
  it('net stableford: most points wins', () => {
    const r = computeEvent({
      settings: settings({ scoring: 'stableford', pointsTable: [3, 2, 1] }),
      event: { course },
      members: [mem('a'), mem('b', { index: 18 })],
      // a: pars + one double bogey (36 - 2 = 34). b: bogey every hole, a stroke each = net par (36).
      scores: { a: card({ 4: 7 }), b: card(Object.fromEntries(PARS.map((p, i) => [i + 1, p + 1]))) },
    });
    expect(r.board.map((e) => [e.key, e.value])).toEqual([
      ['b', 36],
      ['a', 34],
    ]);
    expect(r.points).toEqual({ b: 3, a: 2 });
  });
});

describe('team events', () => {
  const members = [
    mem('a', { team: 'Eagles' }),
    mem('b', { team: 'Eagles' }),
    mem('c', { team: 'Hawks' }),
    mem('d', { team: 'Hawks' }),
  ];

  it('best ball stroke play', () => {
    const r = computeEvent({
      settings: settings({ unit: 'teams', pointsTable: [10, 5] }),
      event: { course },
      members,
      scores: { a: card({ 1: 3 }), b: card({ 2: 3 }), c: card({ 3: 2 }), d: card({ 1: 6 }) },
    });
    expect(r.board.map((e) => [e.key, e.value])).toEqual([
      ['Eagles', 70],
      ['Hawks', 71],
    ]);
    expect(r.points).toEqual({ Eagles: 10, Hawks: 5 });
  });

  it('aggregate (both balls count)', () => {
    const r = computeEvent({
      settings: settings({ unit: 'teams', teamScore: 'aggregate' }),
      event: { course },
      members,
      scores: { a: card({ 1: 3 }), b: card({ 2: 3 }), c: card({ 3: 2 }), d: card({ 1: 6 }) },
    });
    expect(r.board.map((e) => [e.key, e.value, e.toPar])).toEqual([
      ['Eagles', 142, -2],
      ['Hawks', 145, 1],
    ]);
  });

  it('team stableford best ball takes the higher points', () => {
    const r = computeEvent({
      settings: settings({ unit: 'teams', scoring: 'stableford' }),
      event: { course },
      members,
      scores: { a: card({ 1: 3 }), b: card({ 1: 8 }), c: card(), d: card() },
    });
    expect(r.board.map((e) => [e.key, e.value])).toEqual([
      ['Eagles', 37],
      ['Hawks', 36],
    ]);
  });

  it('a teammate who did not play is left out', () => {
    const r = computeEvent({
      settings: settings({ unit: 'teams' }),
      event: { course },
      members,
      scores: { a: card({ 1: 3 }), c: card(), d: card() },
    });
    expect(r.board.find((e) => e.key === 'Eagles')).toMatchObject({ value: 71, complete: true, ids: ['a'] });
  });
});

describe('match play events', () => {
  it('1v1 net with strokes off the low', () => {
    const members = [mem('a', { index: 2 }), mem('b', { index: 6 })];
    // b gets 4 strokes on the hcp 1-4 holes (5, 14, 3, 12) and bogeys them
    // all -> net par, halved. a birdies hole 1 -> a wins 1 up.
    const r = computeEvent({
      settings: settings({ scoring: 'match' }),
      event: { course, matchups: [{ sides: [['a'], ['b']] }] },
      members,
      scores: { a: card({ 1: 3 }), b: card({ 5: 5, 14: 5, 3: 4, 12: 4 }) },
    });
    expect(r.matches[0]).toMatchObject({ result: 'A', keys: ['a', 'b'] });
    expect(r.matches[0].strokes.a.every((s) => s === 0)).toBe(true);
    expect(r.matches[0].strokes.b.reduce((x, y) => x + y, 0)).toBe(4);
    expect(r.records).toEqual({ a: { w: 1, l: 0, t: 0 }, b: { w: 0, l: 1, t: 0 } });
  });

  it('match in progress has no result yet', () => {
    const r = computeEvent({
      settings: settings({ scoring: 'match' }),
      event: { course, matchups: [{ sides: [['a'], ['b']] }] },
      members: [mem('a'), mem('b')],
      scores: { a: card({ 1: 3 }, 5), b: card({}, 5) },
    });
    expect(r.matches[0].result).toBe(null);
    expect(r.records).toEqual({});
  });

  it('2v2 team match records a tie', () => {
    const members = [
      mem('a', { team: 'Eagles' }),
      mem('b', { team: 'Eagles' }),
      mem('c', { team: 'Hawks' }),
      mem('d', { team: 'Hawks' }),
    ];
    const r = computeEvent({
      settings: settings({ unit: 'teams', scoring: 'match' }),
      event: { course, matchups: [{ sides: [['a', 'b'], ['c', 'd']] }] },
      members,
      scores: { a: card({ 1: 3 }), b: card(), c: card({ 2: 3 }), d: card() },
    });
    expect(r.matches[0]).toMatchObject({ result: 'halved', keys: ['Eagles', 'Hawks'] });
    expect(r.records.Eagles).toEqual({ w: 0, l: 0, t: 1 });
  });

  it('ryder cup: win 1, halve ½ per side', () => {
    const members = [
      mem('a', { team: 'USA' }),
      mem('b', { team: 'USA' }),
      mem('c', { team: 'Europe' }),
      mem('d', { team: 'Europe' }),
    ];
    const r = computeEvent({
      settings: settings({ unit: 'ryder', scoring: 'match' }),
      event: {
        course,
        matchups: [{ sides: [['a'], ['c']] }, { sides: [['b'], ['d']] }, { sides: [['a', 'b'], ['c', 'd']] }],
      },
      members,
      scores: { a: card({ 1: 3 }), b: card(), c: card(), d: card({ 2: 3 }) },
    });
    // a beats c, d beats b, four-ball: a's birdie on 1 vs d's on 2 -> halved
    expect(r.cup).toEqual({ USA: 1.5, Europe: 1.5 });

    // Worth more: the round's points per match, or a match's own points.
    const worth = (event) => computeEvent({ settings: settings({ unit: 'ryder', scoring: 'match' }), event: { course, ...event }, members, scores: { a: card({ 1: 3 }), b: card(), c: card(), d: card({ 2: 3 }) } }).cup;
    expect(worth({ matchPoints: 2, matchups: [{ sides: [['a'], ['c']] }, { sides: [['a', 'b'], ['c', 'd']] }] })).toEqual({ USA: 3, Europe: 1 });
    expect(worth({ matchups: [{ sides: [['a'], ['c']], points: 3 }, { sides: [['b'], ['d']] }] })).toEqual({ USA: 3, Europe: 1 });
  });
});

describe('season standings', () => {
  const members = [mem('a'), mem('b'), mem('c')];
  const events = [
    { id: 'e1', date: '2026-05-01', status: 'final', course },
    { id: 'e2', date: '2026-05-08', status: 'final', course },
    { id: 'e3', date: '2026-05-15', status: 'scheduled', course },
  ];
  const scores = {
    e1: { a: card({ 1: 3 }), b: card(), c: card({ 1: 5 }) },
    e2: { a: card({ 1: 5 }), b: card({ 1: 3 }), c: card() },
    e3: { a: card({ 1: 2 }) },
  };

  it('season points add up final weeks only', () => {
    const { standings: s } = computeLeague({ settings: settings({ pointsTable: [10, 6, 3] }), members, events, scores });
    // e1: a 10, b 6, c 3. e2: b 10, c 6, a 3.
    expect(s.map((r) => [r.key, r.points, r.position])).toEqual([
      ['b', 16, 1],
      ['a', 13, 2],
      ['c', 9, 3],
    ]);
  });

  it('best-of counts only the top weeks', () => {
    const { standings: s } = computeLeague({
      settings: settings({ pointsTable: [10, 6, 3], bestOf: 1 }),
      members,
      events,
      scores,
    });
    expect(s.map((r) => [r.key, r.points])).toEqual([
      ['a', 10],
      ['b', 10],
      ['c', 6],
    ]);
    expect(s[0].position).toBe(1);
    expect(s[1].position).toBe(1);
  });

  it('cumulative stroke play ranks by average', () => {
    const { standings: s } = computeLeague({ settings: settings({ season: 'cumulative' }), members, events, scores });
    expect(s.map((r) => [r.key, r.average])).toEqual([
      ['a', 72],
      ['b', 71.5],
      ['c', 72.5],
    ].sort((x, y) => x[1] - y[1]));
  });

  it('match record standings', () => {
    const ev = [
      { id: 'm1', status: 'final', course, matchups: [{ sides: [['a'], ['b']] }] },
      { id: 'm2', status: 'final', course, matchups: [{ sides: [['a'], ['c']] }] },
    ];
    const sc = { m1: { a: card({ 1: 3 }), b: card() }, m2: { a: card(), c: card() } };
    const { standings: s } = computeLeague({ settings: settings({ scoring: 'match' }), members, events: ev, scores: sc });
    expect(s[0]).toMatchObject({ key: 'a', w: 1, t: 1, l: 0, points: 3, position: 1 });
    expect(s.find((r) => r.key === 'b')).toMatchObject({ l: 1, points: 0 });
  });

  it('ryder cup season totals', () => {
    const rm = [mem('a', { team: 'USA' }), mem('c', { team: 'Europe' })];
    const ev = [
      { id: 'r1', status: 'final', course, matchups: [{ sides: [['a'], ['c']] }] },
      { id: 'r2', status: 'final', course, matchups: [{ sides: [['a'], ['c']] }] },
    ];
    const sc = { r1: { a: card({ 1: 3 }), c: card() }, r2: { a: card(), c: card() } };
    const { standings: s } = computeLeague({ settings: settings({ unit: 'ryder' }), members: rm, events: ev, scores: sc });
    expect(s.map((r) => [r.key, r.cup])).toEqual([
      ['USA', 1.5],
      ['Europe', 0.5],
    ]);
  });

  it('standings with nothing played', () => {
    const s = standings(settings(), members, [], {});
    expect(s.every((r) => r.points === 0 && r.position === 1)).toBe(true);
  });
});

describe('league handicaps', () => {
  it('adjusted gross caps holes at net double bogey', () => {
    // scratch: a 10 on a par 4 counts as 6
    expect(adjustedGross(card({ 1: 10 }), course.holes, 0, course.tee)).toBe(74);
    // 18 index gets a stroke: cap is 7
    expect(adjustedGross(card({ 1: 10 }), course.holes, 18, course.tee)).toBe(75);
  });

  it('differential', () => {
    expect(differential(85, { rating: 71.2, slope: 128 })).toBe(12.2);
  });

  it('best N of last M, null until enough rounds', () => {
    expect(leagueIndexFrom([10, 12], { minRounds: 3 })).toBe(null);
    expect(leagueIndexFrom([10, 12, 14, 8, 20], { best: 2, of: 4, minRounds: 3 })).toBe(10);
  });

  it('league mode uses only earlier final rounds', () => {
    const members = [mem('a', { index: 20 })];
    const evs = ['e1', 'e2', 'e3', 'e4'].map((id, i) => ({ id, date: `2026-05-0${i + 1}`, status: 'final', course }));
    const sc = Object.fromEntries(evs.map((e) => [e.id, { a: card({ 1: 6 }) }])); // 74 every week -> diff 2
    const idx = indexesByEvent(evs, sc, members, { mode: 'league', best: 4, of: 8, minRounds: 3 });
    expect([idx.e1.a, idx.e2.a, idx.e3.a, idx.e4.a]).toEqual([20, 20, 20, 2]);
    const own = indexesByEvent(evs, sc, members, { mode: 'index' });
    expect(own.e4.a).toBe(20);
  });
});

describe('formats', () => {
  it('only offers combinations that make sense', () => {
    expect(scoringOptions('ryder')).toEqual(['match']);
    expect(seasonOptions('individual', 'match')).toEqual(['record']);
    expect(seasonOptions('teams', 'stableford')).toEqual(['points', 'cumulative']);
    const s = normalizeSettings({ ...defaultLeagueSettings(), unit: 'ryder', scoring: 'stroke', season: 'points' });
    expect([s.scoring, s.season]).toEqual(['match', 'ryder']);
  });
});

describe('points presets and majors', () => {
  it('FedEx style: 500 to win, steep at the top, one row per place', () => {
    expect(presetTable('fedex', 6)).toEqual([500, 300, 190, 135, 110, 100]);
    const big = presetTable('fedex', 40);
    expect(big).toHaveLength(40);
    expect(big.every((p, i) => i === 0 || p <= big[i - 1])).toBe(true);
    expect(big.at(-1)).toBeGreaterThan(0);
  });

  it('even steps', () => {
    expect(presetTable('even', 4)).toEqual([40, 30, 20, 10]);
  });

  it('places follow the league size (teams = players / team size)', () => {
    expect(placesFor(leagueSettings({ fieldSize: 12 }))).toBe(12);
    expect(placesFor(leagueSettings({ fieldSize: 12, unit: 'teams', teamSize: 2 }))).toBe(6);
    expect(leagueSettings({ fieldSize: 12, unit: 'teams', teamSize: 4 }).pointsTable).toHaveLength(3);
  });

  it('custom tables keep their numbers when the league size changes', () => {
    const s = leagueSettings({ pointsPreset: 'custom', pointsTable: [9, 5, 1], fieldSize: 5 });
    expect(s.pointsTable).toEqual([9, 5, 1, 0, 0]);
  });

  it('old leagues without a preset keep their table', () => {
    const s = leagueSettings({ pointsTable: [25, 20, 16] });
    expect(s.pointsPreset).toBe('custom');
    expect(s.pointsTable).toEqual([25, 20, 16]);
  });

  it('majors pay the multiplier, and a major round awards it', () => {
    const s = leagueSettings({ pointsPreset: 'fedex', fieldSize: 3, majorMultiplier: 1.5 });
    expect(tableForTier(s, 'major')).toEqual([750, 450, 285]);
    const members = [mem('a'), mem('b')];
    const scores = { a: card({ 1: 3 }), b: card() };
    expect(computeEvent({ settings: s, event: { course }, members, scores }).points).toEqual({ a: 500, b: 300 });
    expect(computeEvent({ settings: s, event: { course, tier: 'major' }, members, scores }).points).toEqual({ a: 750, b: 450 });
  });
});

describe('round robin', () => {
  it('everyone meets everyone once', () => {
    const keys = ['a', 'b', 'c', 'd'];
    const seen = new Set();
    for (let w = 0; w < 3; w++) {
      const pairs = roundRobinWeek(keys, w);
      expect(pairs).toHaveLength(2);
      for (const [x, y] of pairs) seen.add([x, y].sort().join());
    }
    expect(seen.size).toBe(6);
  });

  it('odd numbers get a bye', () => {
    expect(roundRobinWeek(['a', 'b', 'c'], 0)).toHaveLength(1);
  });
});
