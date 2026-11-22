import { describe, it, expect } from 'vitest';
import { playerStats, recapFacts, casualRecapFacts, rateableKey, overallStars, matchCourseKey } from './roundRecap.js';
import { PARS, HCPS, parCard } from './games/test-helpers.js';
import { computeRound } from './games/round.js';

const holes = PARS.map((par, i) => ({ par, hcp: HCPS[i] }));

describe('round recap facts', () => {
  it('counts results, best and worst holes, nines', () => {
    const card = parCard(['a'], { a: { 1: 3, 3: 1, 5: 7 } }).a;
    const st = playerStats(holes, card);
    expect(st.played).toBe(18);
    expect(st.gross - st.par).toBe(-1 - 2 + 3);
    expect(st.counts).toMatchObject({ birdie: 1, eagle: 1, ace: 1, 'triple+': 1, par: 15 });
    expect(st.best).toMatchObject({ hole: 3, score: 1, toPar: -2 });
    expect(st.worst).toMatchObject({ hole: 5, score: 7, toPar: 3 });
  });

  it('ranks players best first and skips blank holes', () => {
    const g = parCard(['a', 'b'], { a: { 2: 8 }, b: { 2: 3 } }, 9);
    const f = recapFacts({ course: 'Oak', holes, players: [{ name: 'Al', card: g.a }, { name: 'Bo', card: g.b, moneyCents: -1450 }] });
    expect(f.players.map((p) => p.name)).toEqual(['Bo', 'Al']);
    expect(f.players[0]).toMatchObject({ holesPlayed: 9, toPar: '-1', money: '-$15', bestHole: { hole: 2 } });
    expect(f.players[1].worstHole).toMatchObject({ hole: 2, score: 8 });
    expect(f.players[1].money).toBeUndefined();
    expect(f.par).toBe(72);
  });

  it('builds facts from a casual round with money', () => {
    const round = {
      course: { name: 'Oak Hills', holes },
      tee: { name: 'W', rating: 72, slope: 113 },
      players: [{ id: 'a', name: 'Mike', index: 0 }, { id: 'b', name: 'Dave', index: 0 }],
      handicap: { allowance: 100 },
      games: [{ id: 'g', type: 'stroke', mode: 'perStroke', stake: 100 }],
      scores: parCard(['a', 'b'], { a: { 1: 6 } }),
    };
    const computed = computeRound(round);
    const f = casualRecapFacts(round, computed, () => 'Stroke play');
    expect(f.players[0].name).toBe('Dave');
    expect(f.games).toEqual(['Stroke play']);
    expect(f.scoring).toBe('gross');
    expect(f.payments.length).toBeGreaterThan(0);
  });

  it('only rates shared course ids; overall skips difficulty', () => {
    expect(rateableKey('oga-12')).toBe('oga-12');
    expect(rateableKey('sc-steele-canyon-ranch')).toBe('sc-steele-canyon-ranch');
    expect(rateableKey('k3j2h')).toBe(null);
    expect(overallStars({ conditions: 4, layout: 5, price: 3, difficulty: 1 })).toBe(4);
    expect(overallStars(null)).toBe(null);
  });

  it('finds a course id by exact name for rounds saved without one', () => {
    const list = [
      { key: 'sc-steele-canyon-ranch', name: 'Steele Canyon Golf Club Canyon/Ranch' },
      { key: 'oga-7', name: 'Oak Hills' },
      { key: 'oga-8', name: 'Oak Hills' },
      { key: 'local1', name: 'Backyard' },
    ];
    expect(matchCourseKey('steele canyon golf club canyon / ranch', list)).toBe('sc-steele-canyon-ranch');
    expect(matchCourseKey('Oak Hills', list)).toBe(null); // two matches: unsure
    expect(matchCourseKey('Backyard', list)).toBe(null); // not a shared id
    expect(matchCourseKey('', list)).toBe(null);
  });
});
