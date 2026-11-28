import { describe, it, expect } from 'vitest';
import { computeFoursomeGames, groupKey, holeChoices, newSet, normalizeSet, roundField, setsForGroup, teamBallHoles } from './foursomeGames.js';
import { computeRound } from '../games/round.js';
import { PARS, HCPS, parCard } from '../games/test-helpers.js';

const holes = PARS.map((par, i) => ({ par, hcp: HCPS[i] }));
const course = { name: 'Oak', holes, tee: { name: 'W', rating: 72, slope: 113 } };
const members = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), index: 0 }));
const split = { course, matchFormat: 'split:1-6:scramble|7-12:fourball|13-18:singles' };

const skinsSet = (from, to, perSkin = 1) => {
  const set = newSet(members, 18, { from, to });
  set.settings.skins = { ...set.settings.skins, on: true, stake: perSkin, net: false, carryover: false, mode: 'perSkin' };
  return set;
};

describe('foursome side games', () => {
  it('keys a group by its sorted players', () => {
    expect(groupKey(['d', 'a', 'c'])).toBe('a,c,d');
  });

  it('plays games only on the chosen holes', () => {
    // a birdies 2 (in the scramble stretch) and 8 (in the rest)
    const scores = parCard(['a', 'b', 'c', 'd'], { a: { 2: 3, 8: 2 } });
    const all = computeFoursomeGames({ event: split, members, scores, sets: [skinsSet(1, 18)] });
    const rest = computeFoursomeGames({ event: split, members, scores, sets: [skinsSet(7, 18)] });
    expect(all.totals.a).toBe(600); // 2 skins x $1 x 3 players
    expect(rest.totals.a).toBe(300); // only hole 8 counts
    expect(Object.values(rest.totals).reduce((x, y) => x + y, 0)).toBe(0);
    expect(rest.sets[0].round.course.holes).toHaveLength(12);
  });

  it('adds sets together and settles in fewest payments', () => {
    const scores = parCard(['a', 'b', 'c', 'd'], { a: { 8: 3 }, b: { 14: 3 } });
    const r = computeFoursomeGames({ event: split, members, scores, sets: [skinsSet(7, 12, 2), skinsSet(13, 18, 1)] });
    expect(r.totals).toEqual({ a: 500, b: 100, c: -300, d: -300 }); // a +6-1, b -2+3, c/d -2-1
    expect(r.payments.reduce((s, p) => s + p.cents, 0)).toBe(600);
  });

  it('keeps full-round handicap strokes on a stretch', () => {
    const round = {
      course,
      tee: course.tee,
      players: [{ id: 'a', name: 'A', index: 18 }, { id: 'b', name: 'B', index: 0 }],
      handicap: { allowance: 100, offLow: false },
      games: [],
      scores: parCard(['a', 'b']),
    };
    // hole 7 has stroke index 5: an 18 gets a stroke there in the full round
    expect(computeRound(round, { from: 7, to: 12 }).strokes.a[0]).toBe(1);
  });

  it('drops Nassau unless the set covers all 18, and skips empty sets', () => {
    const set = newSet(members, 18, { from: 7, to: 18 });
    set.settings.nassau = { ...set.settings.nassau, on: true };
    expect(computeFoursomeGames({ event: split, members, scores: parCard(['a', 'b', 'c', 'd']), sets: [set] }).sets).toHaveLength(0);
  });

  it('offers the split stretches and what is left after the scramble', () => {
    expect(holeChoices(split).map((c) => `${c.from}-${c.to}`)).toEqual(['1-18', '1-6', '7-12', '13-18', '7-18']);
    expect(teamBallHoles(split, 5, 8)).toEqual([5, 6]);
    expect(holeChoices({ course }).map((c) => c.label)).toEqual(['All 18']);
  });

  it('cleans up saved sets', () => {
    const s = normalizeSet({ from: 0, to: 40, players: ['a', 'zz'], settings: { skins: { on: true } } }, 18, ['a', 'b']);
    expect(s).toMatchObject({ from: 1, to: 18, players: ['a'] });
    expect(s.settings.skins).toMatchObject({ on: true, stake: 1 });
  });

  it('plays games with players from other foursomes, off everyone\'s scores', () => {
    // a and b in one foursome, e and f in another; skins between a and e.
    const field = ['a', 'b', 'e', 'f'].map((id) => ({ id, name: id.toUpperCase(), index: 0 }));
    const set = newSet([field[0], field[2]], 18);
    set.settings.skins = { ...set.settings.skins, on: true, stake: 5, net: false, carryover: false, mode: 'perSkin' };
    const scores = parCard(['a', 'b', 'e', 'f'], { e: { 3: 2 } });
    const r = computeFoursomeGames({ event: { course }, members: field, scores, sets: [set] });
    expect(r.totals).toEqual({ a: -500, b: 0, e: 500, f: 0 });
    expect(r.involved).toEqual(['a', 'e']);
    expect(r.payments).toEqual([{ from: 'a', to: 'e', cents: 500 }]);
  });

  it('a foursome sees its own sets plus other groups\' sets that include its players', () => {
    const rows = [
      { group_key: 'a,b,c,d', sets: [{ id: 's1', players: ['a', 'b'] }, { id: 's2', players: ['a', 'e'] }] },
      { group_key: 'e,f,g,h', sets: [{ id: 's3', players: ['e', 'f'] }, { id: 's4', players: ['f', 'b'] }] },
    ];
    const mine = setsForGroup(rows, ['d', 'c', 'b', 'a']);
    expect(mine.map((x) => [x.set.id, x.own])).toEqual([['s1', true], ['s2', true], ['s4', false]]);
    expect(mine[2].owner).toBe('e,f,g,h');
    const theirs = setsForGroup(rows, ['e', 'f', 'g', 'h']);
    expect(theirs.map((x) => [x.set.id, x.own])).toEqual([['s2', false], ['s3', true], ['s4', true]]);
  });

  it('the round\'s field: grouped/matched/scored players, or everyone when nobody is grouped', () => {
    const members = ['a', 'b', 'c', 'd', 'x'].map((id) => ({ id, name: id, active: id !== 'd' }));
    expect(roundField({ groups: [['a', 'b']] }, members, { c: [4, null] }).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(roundField({ matchups: [{ sides: [['a'], ['x']] }] }, members).map((m) => m.id)).toEqual(['a', 'x']);
    expect(roundField({}, members).map((m) => m.id)).toEqual(['a', 'b', 'c', 'x']); // d has no account
  });
});
