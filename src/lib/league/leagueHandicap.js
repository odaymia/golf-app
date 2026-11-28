// Handicaps for league / tournament rounds. Pure.
// Everyone plays off their own index (self-reported, GHIN once licensed).
// Scribble never works out a handicap index of its own from scores: the
// USGA program for apps (GHIN Golfer Product Access) forbids an
// alternative handicap value, so the old "league handicap" mode is gone
// and saved leagues that used it fall back to each player's own index.
import { courseHandicap, roundHandicap } from '../games/handicap.js';

const coursePar = (holes) => holes.reduce((s, h) => s + h.par, 0);

// The index each member plays off in each event: their own.
// Returns { eventId: { memberId: index } }.
export function indexesByEvent(events, scores, members) {
  return Object.fromEntries(events.map((ev) => [ev.id, Object.fromEntries(members.map((m) => [m.id, m.index ?? 0]))]));
}

// Playing handicap for an event: course handicap x allowance, capped.
export function playingHandicap(index, course, handicap) {
  const ch = courseHandicap(index ?? 0, course.tee.slope, course.tee.rating, coursePar(course.holes));
  let ph = roundHandicap((ch * (handicap.allowance ?? 100)) / 100);
  if (handicap.maxHandicap != null && ph > handicap.maxHandicap) ph = handicap.maxHandicap;
  return ph;
}
