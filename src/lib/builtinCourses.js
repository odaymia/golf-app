// Courses built into the app, so they're always in search (even when the
// OpenGolfAPI is down) with real tees, ratings and slopes. Our course shape:
// { id, name, place, holes: [{ par, hcp }] x18, tees: [{ name, rating, slope, yards }] }
// Ratings/slopes: GolfPass scorecards (Nov 2026); (W) = women's rating.
// Hole stroke indexes are per 18-hole combination, as on the club's cards.

const holes = (pars, hcps) => pars.map((par, i) => ({ par, hcp: hcps[i] }));

// Steele Canyon Golf Club, Jamul, CA: 27 holes (Canyon, Ranch, Vineyard
// nines) played as three 18-hole combinations.
const RANCH = [4, 4, 4, 3, 5, 4, 4, 3, 5]; // par 36
const VINEYARD = [4, 4, 3, 4, 4, 5, 3, 4, 4]; // par 35
const CANYON = [4, 5, 3, 5, 3, 4, 3, 4, 4]; // par 35

const steele = (id, name, pars, hcps, tees) => ({
  id,
  name: `Steele Canyon Golf Club ${name}`,
  place: 'Jamul, CA',
  holes: holes(pars, hcps),
  tees: tees.map(([teeName, yards, rating, slope]) => ({ name: teeName, rating, slope, yards })),
  source: { provider: 'scribble', note: 'Built into Scribble' },
});

export const BUILTIN_COURSES = [
  steele(
    'sc-steele-vineyard-canyon',
    'Vineyard/Canyon',
    [...VINEYARD, ...CANYON],
    [13, 9, 15, 7, 3, 1, 17, 5, 11, 8, 4, 12, 2, 18, 14, 16, 6, 10],
    [
      ['Black Knight', 6561, 71.8, 135],
      ['Blue', 6144, 69.9, 130],
      ['White', 5903, 68.8, 127],
      ['Gold', 5273, 66.0, 120],
      ['White (W)', 5903, 74.9, 132],
      ['Gold (W)', 5273, 71.3, 124],
      ['Combo (W)', 4992, 69.5, 120],
      ['Red (W)', 4592, 67.3, 115],
    ],
  ),
  steele(
    'sc-steele-canyon-ranch',
    'Canyon/Ranch',
    [...CANYON, ...RANCH],
    [7, 3, 11, 1, 17, 13, 15, 5, 9, 18, 10, 8, 16, 2, 6, 12, 14, 4],
    [
      ['Black Knight', 6781, 73.1, 139],
      ['Blue', 6432, 71.4, 135],
      ['White', 6196, 70.4, 132],
      ['Gold', 5622, 67.7, 126],
      ['White (W)', 6196, 75.6, 135],
      ['Gold (W)', 5622, 72.4, 128],
      ['Combo (W)', 5099, 69.6, 122],
      ['Red (W)', 4627, 66.8, 116],
    ],
  ),
  steele(
    'sc-steele-ranch-vineyard',
    'Ranch/Vineyard',
    [...RANCH, ...VINEYARD],
    [17, 9, 7, 15, 1, 5, 11, 13, 3, 14, 10, 16, 8, 4, 2, 18, 6, 12],
    [
      ['Black Knight', 6908, 73.7, 141],
      ['Blue', 6456, 71.7, 136],
      ['White', 6223, 70.8, 133],
      ['Gold', 5577, 67.9, 127],
      ['White (W)', 6223, 76.1, 135],
      ['Gold (W)', 5577, 72.5, 127],
      ['Combo (W)', 5105, 69.9, 121],
      ['Red (W)', 4747, 67.9, 117],
    ],
  ),
];
