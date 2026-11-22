import { describe, it, expect } from 'vitest';
import { courseFromApi, courseIdFor } from './courseImport.js';
import { courseProblems } from './roundSetup.js';

// Shapes copied from real OpenGolfAPI responses.
const greenbrier = {
  id: 'd3a04de5',
  course_name: 'Oak Hills',
  club_name: 'Oak Hills',
  city: 'Greenbrier',
  state: 'TN',
  holes: 18,
  par: 70,
  tees: [
    { tee_key: 'blue-male', tee_name: 'Blue', tee_color: null, gender: 'Male', course_rating: 67.4, slope: 121, par: 70 },
    { tee_key: 'red-female', tee_name: 'Red', tee_color: 'red', gender: 'Female', course_rating: 69.1, slope: 118, par: 70 },
  ],
  holes_data: [
    [1, 4, 7], [2, 3, 15], [3, 4, 3], [4, 5, 1], [5, 3, 17], [6, 4, 11], [7, 4, 5], [8, 3, 13], [9, 4, 9],
    [10, 4, 10], [11, 4, 2], [12, 4, 8], [13, 3, 16], [14, 4, 6], [15, 4, 18], [16, 3, 4], [17, 5, 14],
    [18, 5, 12], [19, 4, null], [20, 4, null],
  ].map(([number, par, handicap_index]) => ({ number, par, handicap_index })),
};

const dewitt9 = {
  id: 'e1654523',
  course_name: 'Oak Hills Country Club',
  city: 'De Witt',
  state: 'AR',
  holes: 9,
  tees: [{ tee_name: 'Men', gender: 'Male', course_rating: null, slope: 110, par: 36 }],
  holes_data: [
    [1, 5, 13], [2, 5, 9], [3, 5, 11], [4, 5, 15], [5, 4, 5], [6, 3, 3], [7, 3, 17], [8, 3, 7], [9, 3, 1],
  ].map(([number, par, handicap_index]) => ({ number, par, handicap_index })),
};

describe('courseFromApi', () => {
  it('imports an 18-hole card, ignoring stray extra holes', () => {
    const { course, warnings } = courseFromApi(greenbrier);
    expect(course.id).toBe(courseIdFor('d3a04de5'));
    expect(course.name).toBe('Oak Hills');
    expect(course.place).toBe('Greenbrier, TN');
    expect(course.holes).toHaveLength(18);
    expect(course.holes[3]).toEqual({ par: 5, hcp: 1 });
    expect(course.holes.reduce((s, h) => s + h.par, 0)).toBe(70);
    expect(course.tees).toEqual([
      { name: 'Blue', rating: 67.4, slope: 121 },
      { name: 'Red (W)', rating: 69.1, slope: 118 },
    ]);
    expect(warnings).toEqual([]);
    expect(courseProblems(course, course.tees[0])).toEqual([]);
  });

  it('plays a 9-hole course twice with 18-hole stroke indexes', () => {
    const { course, warnings } = courseFromApi(dewitt9);
    expect(course.holes).toHaveLength(18);
    expect(course.holes.reduce((s, h) => s + h.par, 0)).toBe(72);
    // 9 stroke indexes 1,3,5,...,17 -> ranked 1..9 -> 2n-1 out, 2n in
    expect(course.holes[8]).toEqual({ par: 3, hcp: 1 }); // card's #1 (listed 1)
    expect(course.holes[17]).toEqual({ par: 3, hcp: 2 });
    expect(course.holes[6].hcp).toBe(17);
    expect(course.holes[15].hcp).toBe(18);
    expect(courseProblems(course, course.tees[0])).toEqual([]);
    expect(warnings.join(' ')).toMatch(/9-hole/);
    expect(warnings.join(' ')).toMatch(/no course rating/);
    expect(course.tees[0]).toEqual({ name: 'Men', rating: 72, slope: 110 });
  });

  it('doubles a 9-hole course rating', () => {
    const nine = { ...dewitt9, tees: [{ tee_name: 'White', course_rating: 34.2, slope: 118 }] };
    expect(courseFromApi(nine).course.tees[0].rating).toBe(68.4);
  });

  it('fills missing hole handicaps and pars with defaults and warns', () => {
    const broken = {
      ...greenbrier,
      holes_data: greenbrier.holes_data.map((h, i) => (i < 3 ? { ...h, handicap_index: null, par: null } : h)),
    };
    const { course, warnings } = courseFromApi(broken);
    expect(warnings).toHaveLength(2);
    expect(course.holes[0].par).toBe(4);
    expect(courseProblems(course, course.tees[0])).toEqual([]);
  });

  it('no tees: uses par and slope 113', () => {
    const { course, warnings } = courseFromApi({ ...greenbrier, tees: [] });
    expect(course.tees).toEqual([{ name: 'White', rating: 70, slope: 113 }]);
    expect(warnings[0]).toMatch(/No tee ratings/);
  });

  it('bad slope falls back to 113', () => {
    const { course } = courseFromApi({ ...greenbrier, tees: [{ tee_name: 'X', course_rating: 70, slope: 0 }] });
    expect(course.tees[0].slope).toBe(113);
  });

  it('no hole data at all still gives a playable card', () => {
    const { course, warnings } = courseFromApi({ id: 'z', course_name: 'Mystery', holes: 18, tees: [] });
    expect(course.holes).toHaveLength(18);
    expect(courseProblems(course, course.tees[0])).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('keeps the holes it knows when a few are missing (open data gaps)', () => {
    // Steele Canyon Canyon Ranch in the open data: holes 10 and 18 missing
    const card = [[1, 4, 7], [2, 5, 3], [3, 3, 11], [4, 5, 1], [5, 3, 17], [6, 4, 13], [7, 3, 15], [8, 4, 5], [9, 4, 9], [11, 4, 10], [12, 4, 8], [13, 3, 16], [14, 5, 2], [15, 4, 6], [16, 4, 12], [17, 3, 14]];
    const { course, warnings } = courseFromApi({
      id: 'sc',
      course_name: 'Steele Canyon',
      holes: 16,
      tees: [],
      holes_data: card.map(([number, par, handicap_index]) => ({ number, par, handicap_index })),
    });
    expect(course.holes).toHaveLength(18);
    expect(course.holes[0]).toEqual({ par: 4, hcp: 7 });
    expect(course.holes[16]).toEqual({ par: 3, hcp: 14 });
    // holes 10 and 18 get par 4 and the unused stroke indexes 4 and 18
    expect(course.holes[9]).toEqual({ par: 4, hcp: 4 });
    expect(course.holes[17]).toEqual({ par: 4, hcp: 18 });
    expect(courseProblems(course, course.tees[0])).toEqual([]);
    expect(warnings.join(' ')).toMatch(/Holes 10 and 18 had no par/);
    expect(warnings.join(' ')).toMatch(/Holes 10 and 18 had no hole handicap/);
  });

  it('a short card numbered past 9 is still an 18-hole course', () => {
    const holes_data = [1, 2, 3, 10, 11, 12, 13, 14].map((number, i) => ({ number, par: 4, handicap_index: i * 2 + 1 }));
    const { course } = courseFromApi({ id: 'x', course_name: 'Gappy', holes: 8, tees: [], holes_data });
    expect(course.holes).toHaveLength(18);
  });
});
