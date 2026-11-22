import { describe, it, expect } from 'vitest';
import { BUILTIN_COURSES } from './builtinCourses.js';
import { courseProblems } from './roundSetup.js';
import { matchSaved } from './courseSearch.js';

describe('built-in courses', () => {
  it('Steele Canyon: three valid 18-hole cards with the right pars', () => {
    const byName = Object.fromEntries(BUILTIN_COURSES.map((c) => [c.name.replace('Steele Canyon Golf Club ', ''), c]));
    const par = (c) => c.holes.reduce((s, h) => s + h.par, 0);
    expect(par(byName['Vineyard/Canyon'])).toBe(70);
    expect(par(byName['Canyon/Ranch'])).toBe(71);
    expect(par(byName['Ranch/Vineyard'])).toBe(71);
    for (const c of BUILTIN_COURSES) {
      expect(c.holes).toHaveLength(18);
      expect([...c.holes.map((h) => h.hcp)].sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
      for (const t of c.tees) expect(courseProblems(c, t)).toEqual([]);
    }
    // the same nine has the same pars in every combination
    expect(byName['Canyon/Ranch'].holes.slice(9).map((h) => h.par)).toEqual(byName['Ranch/Vineyard'].holes.slice(0, 9).map((h) => h.par));
    expect(byName['Vineyard/Canyon'].holes.slice(9).map((h) => h.par)).toEqual(byName['Canyon/Ranch'].holes.slice(0, 9).map((h) => h.par));
    expect(byName['Ranch/Vineyard'].holes.slice(9).map((h) => h.par)).toEqual(byName['Vineyard/Canyon'].holes.slice(0, 9).map((h) => h.par));
  });

  it('Singing Hills at Sycuan: Willow Glen and Oak Glen, both par 72', () => {
    const find = (id) => BUILTIN_COURSES.find((c) => c.id === id);
    for (const id of ['sc-singing-hills-willow-glen', 'sc-singing-hills-oak-glen']) {
      const c = find(id);
      expect(c.holes.reduce((s, h) => s + h.par, 0)).toBe(72);
      expect([...c.holes.map((h) => h.hcp)].sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
      for (const t of c.tees) expect(courseProblems(c, t)).toEqual([]);
    }
    expect(find('sc-singing-hills-oak-glen').holes.slice(0, 9).reduce((s, h) => s + h.par, 0)).toBe(35);
    expect(matchSaved('singing hills', BUILTIN_COURSES)).toHaveLength(2);
    expect(matchSaved('sycuan oak glen', BUILTIN_COURSES).map((c) => c.id)).toEqual(['sc-singing-hills-oak-glen']);
    expect(matchSaved('willow glen', BUILTIN_COURSES).map((c) => c.id)).toEqual(['sc-singing-hills-willow-glen']);
  });

  it('shows up in search, even misspelled', () => {
    expect(matchSaved('steele canyon', BUILTIN_COURSES)).toHaveLength(3);
    expect(matchSaved('steel canyon ranch', BUILTIN_COURSES).map((c) => c.id)).toContain('sc-steele-canyon-ranch');
    expect(matchSaved('vineyard', BUILTIN_COURSES)).toHaveLength(2);
  });
});
