// One league round (event): handicaps, leaderboard, matches, points. Pure.
import { strokesOnHole } from '../games/handicap.js';
import { matchStatus } from '../games/match.js';
import { playingHandicap } from './leagueHandicap.js';
import { tableForTier } from './format.js';
import { holePoints, naturalBonus, stablefordPoints } from '../games/stableford.js';

export { stablefordPoints, naturalBonus };

// One player's Stableford points on a hole, bonus included.
export function holeStableford(settings, gross, strokes, par) {
  return holePoints(settings.stableford ?? {}, settings.net ? gross - strokes : gross, gross, par);
}

// Team (or side) name for a member; individual leagues key by member id.
export function entityKey(settings, members, ids) {
  if (settings.unit === 'individual') return ids.join('+');
  const m = members.find((x) => x.id === ids[0]);
  return m?.team || ids.join('+');
}

export function entityName(settings, members, key) {
  if (settings.unit !== 'individual') return key;
  return key
    .split('+')
    .map((id) => members.find((m) => m.id === id)?.name ?? '?')
    .join(' & ');
}

// Rank entries (best first), ties share a position. better(a, b) < 0 if a is better.
export function rank(entries, compare) {
  const sorted = [...entries].sort(compare);
  let pos = 0;
  return sorted.map((e, i) => {
    if (i === 0 || compare(sorted[i - 1], e) !== 0) pos = i + 1;
    return { ...e, position: pos };
  });
}

// Points by finish; tied players split the points for the places they cover.
export function awardPoints(ranked, table) {
  const out = {};
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j + 1 < ranked.length && ranked[j + 1].position === ranked[i].position) j++;
    let total = 0;
    for (let k = i; k <= j; k++) total += table[k] ?? 0;
    const each = Math.round((total / (j - i + 1)) * 100) / 100;
    for (let k = i; k <= j; k++) out[ranked[k].key] = each;
    i = j + 1;
  }
  return out;
}

export function computeEvent({ settings, event, members, scores, indexes }) {
  const { holes } = event.course;
  const n = holes.length;
  const blank = () => holes.map(() => null);

  // Handicaps and per-player totals.
  const players = {};
  for (const m of members) {
    const gross = scores[m.id] ?? blank();
    const playing = playingHandicap(indexes?.[m.id] ?? m.index ?? 0, event.course, settings.handicap);
    const strokes = holes.map((h) => strokesOnHole(playing, h.hcp, n));
    let thru = 0;
    let grossTotal = 0;
    let netTotal = 0;
    let stableford = 0;
    let parPlayed = 0;
    gross.forEach((g, i) => {
      if (g == null) return;
      thru++;
      grossTotal += g;
      netTotal += g - strokes[i];
      parPlayed += holes[i].par;
      stableford += holeStableford(settings, g, strokes[i], holes[i].par);
    });
    players[m.id] = { playing, strokes, gross, thru, grossTotal, netTotal, stableford, parPlayed };
  }

  const result = { players, board: [], matches: [], points: {}, values: {}, records: {}, cup: {} };

  if (settings.scoring === 'match') {
    result.matches = (event.matchups ?? []).map((mu) => scoreMatch(settings, members, players, holes, mu));
    for (const m of result.matches) {
      if (settings.unit === 'ryder') {
        for (const k of m.keys) result.cup[k] = result.cup[k] ?? 0;
        if (m.result === 'A') result.cup[m.keys[0]] += 1;
        if (m.result === 'B') result.cup[m.keys[1]] += 1;
        if (m.result === 'halved') {
          result.cup[m.keys[0]] += 0.5;
          result.cup[m.keys[1]] += 0.5;
        }
      } else if (m.result) {
        const [a, b] = m.keys;
        for (const k of [a, b]) result.records[k] = result.records[k] ?? { w: 0, l: 0, t: 0 };
        if (m.result === 'halved') {
          result.records[a].t++;
          result.records[b].t++;
        } else {
          const [w, l] = m.result === 'A' ? [a, b] : [b, a];
          result.records[w].w++;
          result.records[l].l++;
        }
      }
    }
    return result;
  }

  // Stroke play / Stableford leaderboard.
  const stableford = settings.scoring === 'stableford';
  const entries = [];
  if (settings.unit === 'individual') {
    for (const m of members) {
      const p = players[m.id];
      if (p.thru === 0) continue;
      const total = settings.net ? p.netTotal : p.grossTotal;
      entries.push({
        key: m.id,
        name: m.name,
        ids: [m.id],
        value: stableford ? p.stableford : total,
        toPar: stableford ? null : total - p.parPlayed,
        thru: p.thru,
        complete: p.thru === n,
      });
    }
  } else {
    const teams = new Map();
    for (const m of members) {
      if (!m.team) continue;
      if (!teams.has(m.team)) teams.set(m.team, []);
      teams.get(m.team).push(m.id);
    }
    for (const [team, allIds] of teams) {
      const ids = allIds.filter((id) => players[id].thru > 0);
      if (ids.length === 0) continue;
      let value = 0;
      let parPlayed = 0;
      let thru = 0;
      for (let h = 0; h < n; h++) {
        const hole = ids.map((id) => {
          const g = players[id].gross[h];
          if (g == null) return null;
          if (stableford) return holeStableford(settings, g, players[id].strokes[h], holes[h].par);
          return settings.net ? g - players[id].strokes[h] : g;
        });
        if (hole.some((x) => x == null)) continue;
        thru++;
        if (settings.teamScore === 'aggregate') {
          value += hole.reduce((a, b) => a + b, 0);
          parPlayed += holes[h].par * ids.length;
        } else {
          value += stableford ? Math.max(...hole) : Math.min(...hole);
          parPlayed += holes[h].par;
        }
      }
      if (thru === 0) continue;
      entries.push({
        key: team,
        name: team,
        ids,
        value,
        toPar: stableford ? null : value - parPlayed,
        thru,
        complete: thru === n,
      });
    }
  }

  // Live order: Stableford by points, stroke by score to par.
  const live = stableford ? (a, b) => b.value - a.value : (a, b) => a.toPar - b.toPar;
  result.board = rank(entries, (a, b) => live(a, b));

  // Points only for finished rounds, ranked on the full-round total.
  const finished = rank(
    entries.filter((e) => e.complete),
    stableford ? (a, b) => b.value - a.value : (a, b) => a.value - b.value,
  );
  result.points = awardPoints(finished, tableForTier(settings, event.tier));
  for (const e of finished) result.values[e.key] = e.value;
  result.board = result.board.map((e) => ({ ...e, points: result.points[e.key] ?? null }));
  return result;
}

// Match formats. Each match carries its own; a Ryder Cup round sets them all.
//   singles   1 vs 1
//   fourball  2 vs 2, own balls, best score on each hole counts
//   shamble   2 vs 2, own balls after the best drive, combined score
//   scramble  2 vs 2, one team ball (one score per hole for the pair)
//   foursomes 2 vs 2, alternate shot (one score per hole for the pair)
export const MATCH_FORMATS = {
  fourball: { label: 'Four-ball (best ball)', short: 'Four-ball', size: 2 },
  shamble: { label: 'Shamble (combined score)', short: 'Shamble', size: 2 },
  scramble: { label: 'Scramble', short: 'Scramble', size: 2, teamBall: true },
  foursomes: { label: 'Foursomes (alternate shot)', short: 'Foursomes', size: 2, teamBall: true },
  singles: { label: 'Singles (1 vs 1)', short: 'Singles', size: 1 },
};

export function matchFormat(mu) {
  if (mu.format && MATCH_FORMATS[mu.format]) return mu.format;
  return mu.sides[0].length === 1 ? 'singles' : 'fourball';
}

// Team handicap for one-ball formats, from the players' playing handicaps:
// scramble 35% of the lower + 15% of the higher; foursomes half the total.
export function teamHandicap(format, handicaps) {
  const [lo, hi] = [...handicaps].sort((x, y) => x - y);
  if (format === 'scramble') return Math.round(0.35 * lo + 0.15 * (hi ?? lo));
  return Math.round(((lo ?? 0) + (hi ?? 0)) / 2);
}

function scoreMatch(settings, members, players, holes, mu) {
  const [a, b] = mu.sides;
  const ids = [...a, ...b];
  const format = matchFormat(mu);
  const teamBall = MATCH_FORMATS[format].teamBall;
  const n = holes.length;
  const net = settings.net;

  // Handicaps: each player's own, or one team handicap for one-ball formats.
  // Off the low: strokes relative to the best player (or team) in the match.
  const hcpOf = teamBall
    ? Object.fromEntries([a, b].flatMap((side) => {
        const t = teamHandicap(format, side.map((id) => players[id].playing));
        return side.map((id) => [id, t]);
      }))
    : Object.fromEntries(ids.map((id) => [id, players[id].playing]));
  const low = settings.handicap.offLow ? Math.min(...ids.map((id) => hcpOf[id])) : 0;
  const strokes = Object.fromEntries(
    ids.map((id) => [id, holes.map((h) => strokesOnHole(hcpOf[id] - low, h.hcp, n))]),
  );

  const scoreOf = (id, h) => {
    const g = players[id].gross[h];
    return g == null ? null : net ? g - strokes[id][h] : g;
  };
  // The side's number on a hole, or null until it's complete.
  const sideScore = (side, h) => {
    if (teamBall) {
      // The team's one score is saved on each partner's card; use whichever is there.
      const id = side.find((x) => players[x].gross[h] != null);
      return id == null ? null : scoreOf(id, h);
    }
    const sc = side.map((id) => scoreOf(id, h));
    if (sc.some((x) => x == null)) return null;
    return format === 'shamble' ? sc.reduce((x, y) => x + y, 0) : Math.min(...sc);
  };
  const sideScores = [a, b].map((side) => holes.map((_, h) => sideScore(side, h)));
  const holeByHole = holes.map((_, h) => {
    const [sa, sb] = [sideScores[0][h], sideScores[1][h]];
    if (sa == null || sb == null) return null;
    return sa < sb ? 1 : sa > sb ? -1 : 0;
  });
  const status = matchStatus(holeByHole, 0, n - 1, { stopAtCloseout: true });
  const keys = [entityKey(settings, members, a), entityKey(settings, members, b)];
  const result = status.complete ? (status.winner === 0 ? 'A' : status.winner === 1 ? 'B' : 'halved') : null;
  return {
    sides: [a, b],
    keys,
    format,
    teamBall: !!teamBall,
    names: [a, b].map((side) => side.map((id) => members.find((m) => m.id === id)?.name ?? '?').join(' & ')),
    status,
    results: holeByHole,
    running: runningStatus(holeByHole, status.played),
    sideScores,
    strokes,
    result,
  };
}

// Margin after each hole from side A's view (2 = 2 up, -1 = 1 down), up to
// the holes that counted; null after that.
export function runningStatus(results, played) {
  let up = 0;
  return results.map((r, h) => {
    if (h >= played || r == null) return null;
    up += r;
    return up;
  });
}
