// Handicap math (World Handicap System style).
// A plus handicap is stored as a negative index: +2.1 -> -2.1.

// Round to nearest whole number, .5 away from zero, ignoring float noise
// like 14.499999999.
export function roundHandicap(x) {
  const clean = Number(x.toFixed(6));
  return Math.sign(clean) * Math.round(Math.abs(clean)) + 0;
}

// Course Handicap = Index x (Slope / 113) + (Course Rating - Par)
export function courseHandicap(index, slope, rating, par) {
  return roundHandicap(index * (slope / 113) + (rating - par));
}

// Playing handicaps for everyone in the round.
// allowance: percent of course handicap (100 = full).
// offLow: everyone plays off the low man (low man gets 0 strokes).
export function playingHandicaps(players, tee, par, { allowance = 100, offLow = false } = {}) {
  const result = {};
  for (const p of players) {
    const ch = courseHandicap(Number(p.index) || 0, tee.slope, tee.rating, par);
    result[p.id] = roundHandicap((ch * allowance) / 100);
  }
  if (offLow && players.length > 0) {
    const low = Math.min(...Object.values(result));
    for (const id of Object.keys(result)) result[id] -= low;
  }
  return result;
}

// Strokes a player gets on one hole. holeHcp is the hole's stroke index
// (1 = hardest). Plus handicaps give strokes back on the easiest holes.
export function strokesOnHole(playingHcp, holeHcp, holeCount = 18) {
  if (playingHcp >= 0) {
    const base = Math.floor(playingHcp / holeCount);
    const extra = playingHcp % holeCount;
    return base + (holeHcp <= extra ? 1 : 0);
  }
  const plus = -playingHcp;
  const base = Math.floor(plus / holeCount);
  const extra = plus % holeCount;
  return 0 - (base + (holeHcp > holeCount - extra ? 1 : 0));
}

// { playerId: [strokes on hole 1, ..., hole N] }
export function strokeTable(playing, holes) {
  const table = {};
  for (const [id, ph] of Object.entries(playing)) {
    table[id] = holes.map((h) => strokesOnHole(ph, h.hcp, holes.length));
  }
  return table;
}
