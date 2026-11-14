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
    expect(courseProblems(c, c.tees[0])).toEqual(['Give the course a name.']);
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
  it('defaults: nassau + skins, dollars to cents', () => {
    const games = buildGames(defaultSettings(), four);
    expect(games.map((g) => g.type)).toEqual(['nassau', 'skins']);
    expect(games[0].stakes).toEqual({ front: 500, back: 500, overall: 500 });
    expect(games[1].stake).toBe(100);
  });

  it('wolf and vegas only with four players', () => {
    const s = defaultSettings();
    s.wolf.on = true;
    s.vegas.on = true;
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
    for (const k of ['match', 'stroke', 'wolf', 'vegas', 'stableford']) s[k].on = true;
    const course = { ...blankCourse(), name: 'Home' };
    const round = newRound({ course, tee: course.tees[0], players: four, settings: s });
    const r = computeRound(round);
    expect(r.games).toHaveLength(7);
    expect(r.payments).toEqual([]);
    expect(r.holesComplete).toBe(0);
  });
});
