// League handicaps, WHS style. Pure.
import { courseHandicap, roundHandicap, strokesOnHole } from '../games/handicap.js';

const coursePar = (holes) => holes.reduce((s, h) => s + h.par, 0);

// Adjusted gross: each hole capped at net double bogey (par + 2 + strokes).
export function adjustedGross(gross, holes, index, tee) {
  const ch = courseHandicap(index ?? 0, tee.slope, tee.rating, coursePar(holes));
  return holes.reduce((sum, h, i) => {
    const cap = h.par + 2 + strokesOnHole(ch, h.hcp, holes.length);
    return sum + Math.min(gross[i], cap);
  }, 0);
}

// Score differential = (113 / Slope) x (Adjusted Gross - Course Rating), to 0.1.
export function differential(adjGross, tee) {
  return Math.round(((113 / tee.slope) * (adjGross - tee.rating)) * 10) / 10;
}

// Average of the best `best` of the last `of` differentials, to 0.1.
// null until there are `minRounds` differentials.
export function leagueIndexFrom(diffs, { best = 4, of = 8, minRounds = 3 } = {}) {
  const recent = diffs.slice(-of);
  if (recent.length < minRounds) return null;
  const take = Math.min(best, recent.length);
  const chosen = [...recent].sort((a, b) => a - b).slice(0, take);
  const avg = chosen.reduce((s, d) => s + d, 0) / take;
  return Math.round(avg * 10) / 10;
}

// The handicap index each member plays off in each event, in date order.
// League mode uses only rounds from earlier final events, so a week's result
// never changes the handicap used in that same week.
//   events: [{ id, date, status, course: { holes, tee } }]
//   scores: { eventId: { memberId: gross[] } }
//   members: [{ id, index }]
// Returns { eventId: { memberId: index } }.
export function indexesByEvent(events, scores, members, handicap) {
  const ordered = [...events].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || 0);
  const diffs = Object.fromEntries(members.map((m) => [m.id, []]));
  const out = {};
  for (const ev of ordered) {
    out[ev.id] = {};
    for (const m of members) {
      let idx = m.index ?? 0;
      if (handicap.mode === 'league') {
        const li = leagueIndexFrom(diffs[m.id], handicap);
        if (li != null) idx = li;
      }
      out[ev.id][m.id] = idx;
    }
    if (ev.status !== 'final') continue;
    for (const m of members) {
      const gross = scores[ev.id]?.[m.id];
      if (!gross || gross.length !== ev.course.holes.length || gross.some((g) => g == null)) continue;
      const adj = adjustedGross(gross, ev.course.holes, out[ev.id][m.id], ev.course.tee);
      diffs[m.id].push(differential(adj, ev.course.tee));
    }
  }
  return out;
}

// Playing handicap for an event: course handicap x allowance, capped.
export function playingHandicap(index, course, handicap) {
  const ch = courseHandicap(index ?? 0, course.tee.slope, course.tee.rating, coursePar(course.holes));
  let ph = roundHandicap((ch * (handicap.allowance ?? 100)) / 100);
  if (handicap.maxHandicap != null && ph > handicap.maxHandicap) ph = handicap.maxHandicap;
  return ph;
}
