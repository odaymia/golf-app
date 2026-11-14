// One league round (event): handicaps, leaderboard, matches, points. Pure.
import { strokesOnHole } from '../games/handicap.js';
import { holeResults, matchStatus } from '../games/match.js';
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

function scoreMatch(settings, members, players, holes, mu) {
  const [a, b] = mu.sides;
  const ids = [...a, ...b];
  // Off the low: strokes relative to the best player in this match.
  const low = settings.handicap.offLow ? Math.min(...ids.map((id) => players[id].playing)) : 0;
  const strokes = Object.fromEntries(
    ids.map((id) => [id, holes.map((h) => strokesOnHole(players[id].playing - low, h.hcp, holes.length))]),
  );
  const ctx = {
    players: ids.map((id) => ({ id })),
    holes,
    gross: Object.fromEntries(ids.map((id) => [id, players[id].gross])),
    strokes,
  };
  const holeByHole = holeResults(ctx, a, b, settings.net);
  const status = matchStatus(holeByHole, 0, holes.length - 1, { stopAtCloseout: true });
  const keys = [entityKey(settings, members, a), entityKey(settings, members, b)];
  const result = status.complete ? (status.winner === 0 ? 'A' : status.winner === 1 ? 'B' : 'halved') : null;
  return {
    sides: [a, b],
    keys,
    names: [a, b].map((s) => s.map((id) => members.find((m) => m.id === id)?.name ?? '?').join(' & ')),
    status,
    results: holeByHole,
    strokes,
    result,
  };
}
