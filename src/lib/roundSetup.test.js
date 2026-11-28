import { describe, it, expect } from 'vitest';
import {
  parseIndex,
  formatIndex,
  courseProblems,
  blankCourse,
  teamOptions,
  matchupsFor,
  buildGames,
  defaultSettings,
  newRound,
  usesTeams,
  gameAvailable,
  gameLimitText,
  MAX_PLAYERS,
} from './roundSetup.js';
import { computeRound } from './games/round.js';

const four = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), index: 10 }));

describe('parseIndex', () => {
  it('reads plus handicaps', () => {
    expect(parseIndex('12.4')).toBe(12.4);
    expect(parseIndex('+2.1')).toBe(-2.1);
    expect(parseIndex('')).toBe(0);
    expect(parseIndex('abc')).toBe(null);
    expect(parseIndex('60')).toBe(null);
    expect(formatIndex(-2.1)).toBe('+2.1');
  });
});

describe('courseProblems', () => {
  it('flags duplicate hole handicaps and missing names', () => {
    const c = blankCourse();
    expect(courseProblems(c, c.tees[0])).toEqual(['Pick a course: search for it, or type its name and add it as a new course.']);
    c.name = 'Home';
    c.holes[1].hcp = 7;
    expect(courseProblems(c, c.tees[0])[0]).toMatch(/missing 15/);
  });
});

describe('teams and matchups', () => {
  it('three team splits for a foursome', () => {
    expect(teamOptions(four)).toHaveLength(3);
    expect(teamOptions(four.slice(0, 3))).toEqual([]);
  });

  it('teams format vs everyone-plays-everyone', () => {
    const teams = teamOptions(four)[1];
    expect(matchupsFor(four, 'teams', teams)).toEqual([teams]);
    expect(matchupsFor(four, 'each', teams)).toHaveLength(6);
    expect(matchupsFor(four.slice(0, 3), 'teams', null)).toHaveLength(3);
    expect(matchupsFor(four.slice(0, 2), 'teams', null)).toEqual([[['a'], ['b']]]);
  });
});

describe('buildGames', () => {
  it('teams only matter when a chosen game plays 2 vs 2', () => {
    const s = defaultSettings();
    expect(usesTeams(s, 4)).toBe(false);
    s.skins.on = true;
    expect(usesTeams(s, 4)).toBe(false);
    s.nassau.on = true; // defaults to 2 vs 2 teams
    expect(usesTeams(s, 4)).toBe(true);
    expect(usesTeams(s, 3)).toBe(false);
    s.nassau.format = 'each';
    expect(usesTeams(s, 4)).toBe(false);
    s.vegas.on = true;
    expect(usesTeams(s, 4)).toBe(true);
  });

  it('which games work for how many players', () => {
    expect(MAX_PLAYERS).toBe(8);
    expect(gameAvailable('skins', 8)).toBe(true);
    expect(gameAvailable('skins', 24)).toBe(true); // league/tournament side games
    expect(gameAvailable('skins', 1)).toBe(false);
    expect(gameAvailable('nassau', 6)).toBe(true);
    expect(gameAvailable('nassau', 7)).toBe(false);
    expect(gameAvailable('wolf', 5)).toBe(false);
    expect(gameLimitText('wolf')).toBe('needs 4 players');
    expect(gameLimitText('nassau')).toBe('2–6 players');
    expect(gameLimitText('skins')).toBe('needs 2+ players');
  });

  it('an 8-player round: skins pot, stroke and Stableford all net to zero', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, index: (i * 7) % 30 }));
    const s = defaultSettings();
    s.skins.on = true;
    s.skins.mode = 'pot';
    s.skins.buyIn = 10;
    s.stroke.on = true;
    s.stableford.on = true;
    s.nassau.on = true; // not available for 8: left out
    const course = { ...blankCourse(), name: 'Big Day' };
    const round = newRound({ course, tee: course.tees[0], players, settings: s });
    expect(round.games.map((g) => g.type)).toEqual(['skins', 'stroke', 'stableford']);
    expect(round.games[0]).toMatchObject({ mode: 'pot', buyIn: 1000 });
    // Fill in scores: everyone shoots par except a few birdies and bogeys.
    for (const [i, p] of players.entries()) round.scores[p.id] = course.holes.map((h, k) => h.par + (((i + k) % 5) - 2 === 0 ? -1 : ((i * k) % 3) - 1 > 0 ? 1 : 0));
    const r = computeRound(round);
    expect(Object.values(r.totals).reduce((a, b) => a + b, 0)).toBe(0);
    for (const g of r.games) expect(Object.values(g.balances).reduce((a, b) => a + b, 0)).toBe(0);
    // Settle-up pays everything back exactly.
    const paid = Object.fromEntries(players.map((p) => [p.id, 0]));
    for (const pay of r.payments) {
      paid[pay.from] -= pay.cents;
      paid[pay.to] += pay.cents;
    }
    expect(paid).toEqual(r.totals);
  });

  it('split match: 2 vs 2 teams carry the stretches; everyone-vs-everyone ignores them', () => {
    const s = defaultSettings();
    s.match.on = true;
    s.match.split = [
      { from: 1, to: 6, format: 'fourball' },
      { from: 7, to: 12, format: 'shamble' },
      { from: 13, to: 18, format: 'singles' },
    ];
    const g = buildGames(s, four).find((x) => x.type === 'match');
    expect(g.segments).toEqual(s.match.split);
    expect(g.segments).not.toBe(s.match.split);
    s.match.format = 'each';
    expect(buildGames(s, four).find((x) => x.type === 'match').segments).toBeUndefined();
  });

  it('defaults: no games until you pick them', () => {
    expect(buildGames(defaultSettings(), four)).toEqual([]);
  });

  it('nassau + skins, dollars to cents', () => {
    const s = defaultSettings();
    s.nassau.on = true;
    s.skins.on = true;
    const games = buildGames(s, four);
    expect(games.map((g) => g.type)).toEqual(['nassau', 'skins']);
    expect(games[0].stakes).toEqual({ front: 500, back: 500, overall: 500 });
    expect(games[1].stake).toBe(100);
  });

  it('wolf and vegas only with four players', () => {
    const s = defaultSettings();
    for (const k of ['nassau', 'skins', 'wolf', 'vegas']) s[k].on = true;
    expect(buildGames(s, four).map((g) => g.type)).toContain('vegas');
    expect(buildGames(s, four.slice(0, 3)).map((g) => g.type)).toEqual(['nassau', 'skins']);
    const vegas = buildGames(s, four).find((g) => g.type === 'vegas');
    expect(vegas.stake).toBe(10);
  });

  it('stableford: individual, or team with the chosen teams', () => {
    const s = defaultSettings();
    s.stableford.on = true;
    s.stableford.scoring = { preset: 'modified' };
    const solo = buildGames(s, four).find((g) => g.type === 'stableford');
    expect(solo).toMatchObject({ teams: null, mode: 'perPoint', stake: 100 });
    expect(solo.scoring.points.double).toBe(-3);
    s.stableford.format = 'teams';
    s.teamsIndex = 2;
    expect(buildGames(s, four).find((g) => g.type === 'stableford').teams).toEqual(teamOptions(four)[2]);
    // three players can't play teams: falls back to every player
    expect(buildGames(s, four.slice(0, 3)).find((g) => g.type === 'stableford').teams).toBe(null);
  });

  it('a new round computes with every game on', () => {
    const s = defaultSettings();
    for (const k of ['nassau', 'skins', 'match', 'stroke', 'wolf', 'vegas', 'stableford']) s[k].on = true;
    const course = { ...blankCourse(), name: 'Home' };
    const round = newRound({ course, tee: course.tees[0], players: four, settings: s });
    const r = computeRound(round);
    expect(r.games).toHaveLength(7);
    expect(r.payments).toEqual([]);
    expect(r.holesComplete).toBe(0);
  });
});
