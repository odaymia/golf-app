// Season standings from final events. Pure.
import { computeEvent, entityName } from './event.js';
import { indexesByEvent } from './leagueHandicap.js';

// Every event's result, with the handicap each member played off.
export function computeLeague({ settings, members, events, scores }) {
  const indexes = indexesByEvent(events, scores, members, settings.handicap);
  const results = {};
  for (const ev of events) {
    results[ev.id] = computeEvent({
      settings,
      event: ev,
      members,
      scores: scores[ev.id] ?? {},
      indexes: indexes[ev.id],
    });
  }
  const ordered = orderEvents(events);
  return {
    indexes,
    results,
    standings:
      settings.kind === 'tournament'
        ? tournamentStandings(settings, members, ordered, results)
        : standings(settings, members, events, results),
  };
}

export function orderEvents(events) {
  return [...events].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

// Tournament leaderboard: every round counts live, finished or not.
// Stroke/Stableford: [{ key, name, rounds: [{ value, toPar, thru, complete } | null],
//   total, toPar, today, thru, position }] best first. Players with no
//   scores yet sort to the bottom without a position.
// Ryder Cup: [{ key, name, rounds: [points], total, projected, position }],
//   where projected adds the matches still on the course (leading = 1,
//   all square = ½).
export function tournamentStandings(settings, members, events, results) {
  if (settings.unit === 'ryder') return ryderStandings(settings, events, results);
  const stableford = settings.scoring === 'stableford';
  const keys = settings.unit === 'individual' ? members.map((m) => m.id) : [...new Set(members.map((m) => m.team).filter(Boolean))];
  // "Today" is the latest round anyone has scored.
  const live = [...events].reverse().find((ev) => results[ev.id]?.board.length);
  const rows = keys.map((key) => {
    const rounds = events.map((ev) => {
      const e = results[ev.id]?.board.find((b) => b.key === key);
      return e ? { value: e.value, toPar: e.toPar, thru: e.thru, complete: e.complete } : null;
    });
    const played = rounds.filter(Boolean);
    const todayEntry = live ? results[live.id].board.find((b) => b.key === key) : null;
    return {
      key,
      name: entityName(settings, members, key),
      rounds,
      started: played.length > 0,
      total: played.reduce((s, r) => s + r.value, 0),
      toPar: stableford ? null : played.reduce((s, r) => s + r.toPar, 0),
      today: todayEntry ? (stableford ? todayEntry.value : todayEntry.toPar) : null,
      thru: todayEntry ? (todayEntry.complete ? 'F' : todayEntry.thru) : null,
    };
  });
  const compare = stableford ? (a, b) => b.total - a.total : (a, b) => a.toPar - b.toPar;
  const started = rows.filter((r) => r.started).sort(compare);
  let pos = 0;
  const ranked = started.map((r, i) => {
    if (i === 0 || compare(started[i - 1], r) !== 0) pos = i + 1;
    return { ...r, position: pos };
  });
  return [...ranked, ...rows.filter((r) => !r.started).map((r) => ({ ...r, position: null }))];
}

function ryderStandings(settings, events, results) {
  const rows = settings.sides.map((side) => {
    const rounds = events.map((ev) => results[ev.id]?.cup[side] ?? 0);
    let onCourse = 0;
    for (const ev of events) {
      for (const m of results[ev.id]?.matches ?? []) {
        if (m.result || m.status.played === 0) continue;
        const i = m.keys.indexOf(side);
        if (i < 0) continue;
        const worth = m.points ?? 1;
        if (m.status.up === 0) onCourse += worth / 2;
        else if ((m.status.up > 0 ? 0 : 1) === i) onCourse += worth;
      }
    }
    const total = rounds.reduce((s, x) => s + x, 0);
    return { key: side, name: side, rounds, total, projected: total + onCourse };
  });
  const sorted = [...rows].sort((a, b) => b.total - a.total || b.projected - a.projected);
  return sorted.map((r, i) => ({
    ...r,
    position: i > 0 && sorted[i - 1].total === r.total && sorted[i - 1].projected === r.projected ? 1 : i + 1,
  }));
}

const sumBest = (list, bestOf, higherIsBetter = true) => {
  const sorted = [...list].sort((a, b) => (higherIsBetter ? b - a : a - b));
  return (bestOf ? sorted.slice(0, bestOf) : sorted).reduce((s, x) => s + x, 0);
};

// [{ key, name, ...stats, position }] best first.
export function standings(settings, members, events, results) {
  const finals = events.filter((e) => e.status === 'final').map((e) => results[e.id]).filter(Boolean);
  const keys = new Set();
  if (settings.unit === 'individual') members.forEach((m) => keys.add(m.id));
  else members.forEach((m) => m.team && keys.add(m.team));

  const name = (k) => entityName(settings, members, k);
  let rows;
  let compare;

  if (settings.season === 'ryder') {
    rows = [...keys].map((k) => ({ key: k, name: k, cup: finals.reduce((s, r) => s + (r.cup[k] ?? 0), 0) }));
    compare = (a, b) => b.cup - a.cup;
  } else if (settings.season === 'record') {
    const { win = 2, tie = 1, loss = 0 } = settings.record ?? {};
    rows = [...keys].map((k) => {
      const rec = { w: 0, l: 0, t: 0 };
      for (const r of finals) {
        const x = r.records[k];
        if (x) {
          rec.w += x.w;
          rec.l += x.l;
          rec.t += x.t;
        }
      }
      return { key: k, name: name(k), ...rec, played: rec.w + rec.l + rec.t, points: rec.w * win + rec.t * tie + rec.l * loss };
    });
    compare = (a, b) => b.points - a.points || b.w - a.w || a.l - b.l;
  } else if (settings.season === 'cumulative') {
    const stableford = settings.scoring === 'stableford';
    rows = [...keys].map((k) => {
      const vals = finals.map((r) => r.values[k]).filter((v) => v != null);
      const counted = settings.bestOf ? Math.min(settings.bestOf, vals.length) : vals.length;
      const total = sumBest(vals, settings.bestOf, stableford);
      return {
        key: k,
        name: name(k),
        played: vals.length,
        total,
        average: counted ? Math.round((total / counted) * 10) / 10 : null,
      };
    });
    // Stableford: most total points. Stroke: lowest average (needs a round).
    compare = stableford
      ? (a, b) => b.total - a.total
      : (a, b) => (a.average ?? Infinity) - (b.average ?? Infinity) || b.played - a.played;
  } else {
    rows = [...keys].map((k) => {
      const pts = finals.map((r) => r.points[k]).filter((v) => v != null);
      return {
        key: k,
        name: name(k),
        played: pts.length,
        points: Math.round(sumBest(pts, settings.bestOf) * 100) / 100,
      };
    });
    compare = (a, b) => b.points - a.points || b.played - a.played;
  }

  const sorted = [...rows].sort(compare);
  let pos = 0;
  return sorted.map((r, i) => {
    if (i === 0 || compare(sorted[i - 1], r) !== 0) pos = i + 1;
    return { ...r, position: pos };
  });
}

// Round-robin pairings (circle method). Week w (0-based) of a schedule where
// everyone meets everyone once; an odd count gives one bye per week.
export function roundRobinWeek(keys, week) {
  const list = [...keys];
  if (list.length < 2) return [];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds = n - 1;
  const w = ((week % rounds) + rounds) % rounds;
  const fixed = list[0];
  const rest = list.slice(1);
  const rotated = rest.slice(rest.length - w).concat(rest.slice(0, rest.length - w));
  const order = [fixed, ...rotated];
  const pairs = [];
  for (let i = 0; i < n / 2; i++) {
    const a = order[i];
    const b = order[n - 1 - i];
    if (a != null && b != null) pairs.push([a, b]);
  }
  return pairs;
}
