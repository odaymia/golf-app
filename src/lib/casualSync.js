// Pure helpers for shared casual rounds (several phones, one round). No
// React, network or storage here; lib/casualRounds.js does the sending.
//
// A round is its setup (course, tee, players, games, foursomes; fixed at
// tee-off) plus entries: everything that changes during play, one value per
// key. Keys:
//   s:<playerId>:<hole>                      a score (hole 1-based; null = cleared)
//   w:<gameId>:<hole>                        a Wolf pick
//   p:<gameId>:<matchup>:<segment>:<hole>    a Nassau press (true / null)
//   status                                   'final' / null
//   recap, pr:<name>                         AI recaps
// Each phone keeps `known` = {key: {v, at}}: the latest value it knows and
// when it was made (phone clock, ms). Merging takes the newer `at` per key,
// so one player's edits never wipe another's, and a cleared score is a null
// with a time (it can't come back from an older copy).

const MAX_GROUP = 4;

// Foursomes: n players in order, as even as possible, bigger groups first
// (5 -> 3+2, 9 -> 3+3+3, 10 -> 4+3+3). Returns arrays of player ids.
export function defaultGroups(ids) {
  const k = Math.max(1, Math.ceil(ids.length / MAX_GROUP));
  const base = Math.floor(ids.length / k);
  const extra = ids.length % k;
  const groups = [];
  let at = 0;
  for (let g = 0; g < k; g++) {
    const size = base + (g < extra ? 1 : 0);
    groups.push(ids.slice(at, at + size));
    at += size;
  }
  return groups.filter((g) => g.length);
}

// The round's foursomes (older rounds: everyone in one group).
export function roundGroups(round) {
  const ids = round.players.map((p) => p.id);
  if (!round.groups?.length) return [ids];
  const listed = new Set(round.groups.flat());
  const groups = round.groups.map((g) => g.filter((id) => ids.includes(id))).filter((g) => g.length);
  const missing = ids.filter((id) => !listed.has(id));
  return missing.length ? [...groups, missing] : groups;
}

// The player ids this account keeps score for: its own foursome. A round
// that isn't shared (or an account not in it) can score everyone, as before.
export function myGroupIds(round, userId) {
  const groups = roundGroups(round);
  if (!round.shared) return round.players.map((p) => p.id);
  const me = round.players.find((p) => p.userId && p.userId === userId);
  if (!me) return [];
  return groups.find((g) => g.includes(me.id)) ?? [me.id];
}

export const canScore = (round, userId, playerId) => myGroupIds(round, userId).includes(playerId);

// Problems with a foursome plan (setup): too big or empty.
export function groupProblems(groups, names = {}) {
  const out = [];
  groups.forEach((g, i) => {
    if (g.length > MAX_GROUP)
      out.push(`Group ${i + 1} has ${g.length} players (${g.map((id) => names[id] ?? id).join(', ')}): 4 at most.`);
  });
  return out;
}

const pressKey = (gameId, p) => `p:${gameId}:${p.matchup}:${p.segment}:${p.hole}`;

// Round -> {key: value} for every non-empty entry.
export function toEntries(round) {
  const out = {};
  for (const p of round.players) {
    (round.scores[p.id] ?? []).forEach((g, i) => {
      if (g != null) out[`s:${p.id}:${i + 1}`] = g;
    });
  }
  for (const g of round.games ?? []) {
    if (g.type === 'wolf') for (const [hole, d] of Object.entries(g.decisions ?? {})) if (d) out[`w:${g.id}:${hole}`] = d;
    if (g.type === 'nassau') for (const p of g.presses ?? []) out[pressKey(g.id, p)] = true;
  }
  if (round.status === 'final') out.status = 'final';
  if (round.recap != null) out.recap = round.recap;
  for (const [name, text] of Object.entries(round.playerRecaps ?? {})) if (text != null) out[`pr:${name}`] = text;
  return out;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// What changed on this phone since `known`: new known + the changes to send.
export function diffEntries(known, round, now = Date.now()) {
  const current = toEntries(round);
  const next = { ...known };
  const changes = [];
  for (const key of new Set([...Object.keys(known), ...Object.keys(current)])) {
    const v = current[key] ?? null;
    if (same(known[key]?.v, v)) continue;
    // Never stamp an older time than what we already know for this key.
    const at = Math.max(now, (known[key]?.at ?? 0) + 1);
    next[key] = { v, at };
    changes.push({ key, value: v, at });
  }
  return { known: next, changes };
}

// A starting `known` for a round whose record was lost: everything it shows
// at time 0, so any real change from another phone wins over it.
export function seedKnown(round) {
  return Object.fromEntries(Object.entries(toEntries(round)).map(([k, v]) => [k, { v, at: 0 }]));
}

// Merge rows from the server ([{key, value, at}]) into known: newer wins.
// Returns the new known and {key: value} for keys whose value changed.
export function mergeServer(known, rows) {
  const next = { ...known };
  const changed = {};
  for (const r of rows ?? []) {
    const at = Number(r.at);
    const mine = next[r.key];
    if (mine && mine.at >= at) continue;
    const v = r.value ?? null;
    next[r.key] = { v, at };
    if (!same(mine?.v, v)) changed[r.key] = v;
  }
  return { known: next, changed };
}

// Put entries ({key: value}) onto a round. Returns a new round.
export function applyEntries(round, entries) {
  const r = structuredClone(round);
  for (const [key, v] of Object.entries(entries)) {
    if (key === 'status') {
      r.status = v === 'final' ? 'final' : 'active';
      continue;
    }
    if (key === 'recap') {
      if (v == null) delete r.recap;
      else r.recap = v;
      continue;
    }
    const [kind, ...rest] = key.split(':');
    if (kind === 'pr') {
      const name = rest.join(':');
      r.playerRecaps = { ...r.playerRecaps };
      if (v == null) delete r.playerRecaps[name];
      else r.playerRecaps[name] = v;
    } else if (kind === 's') {
      const [pid, hole] = rest;
      const i = Number(hole) - 1;
      if (!r.scores[pid] || !(i >= 0 && i < r.scores[pid].length)) continue;
      r.scores[pid][i] = v == null ? null : Number(v);
    } else if (kind === 'w') {
      const [gameId, hole] = rest;
      const g = r.games.find((x) => x.id === gameId);
      if (!g) continue;
      g.decisions = { ...g.decisions };
      if (v == null) delete g.decisions[hole];
      else g.decisions[hole] = v;
    } else if (kind === 'p') {
      const [gameId, matchup, segment, hole] = rest;
      const g = r.games.find((x) => x.id === gameId);
      if (!g) continue;
      const press = { matchup: Number(matchup), segment, hole: Number(hole) };
      const presses = (g.presses ?? []).filter((p) => pressKey(gameId, p) !== key);
      if (v) presses.push(press);
      g.presses = presses;
    }
  }
  return r;
}

// The setup saved on the server: everything but play state and this phone's
// own things (current hole, course rating done).
export function setupOf(round) {
  const rest = { ...round };
  for (const k of ['scores', 'currentHole', 'status', 'recap', 'playerRecaps', 'rated', 'updatedAt', 'syncedAt', 'openedHere', 'shared', 'ownerId'])
    delete rest[k];
  return {
    ...rest,
    games: rest.games.map((g) =>
      g.type === 'wolf' ? { ...g, decisions: {} } : g.type === 'nassau' ? { ...g, presses: [] } : g,
    ),
  };
}

// A round from the server (setup + all its entries), as this phone stores it.
export function roundFromServer({ id, owner_id, setup, created_at }, rows) {
  const base = {
    ...setup,
    id,
    shared: true,
    ownerId: owner_id,
    createdAt: setup.createdAt ?? Date.parse(created_at),
    status: 'active',
    currentHole: 1,
    scores: Object.fromEntries(setup.players.map((p) => [p.id, setup.course.holes.map(() => null)])),
  };
  const { known, changed } = mergeServer({}, rows);
  return { round: applyEntries(base, changed), known };
}

// First hole (1-based) where any of these players has no score; last hole if all done.
export function firstOpenHole(round, ids) {
  const n = round.course.holes.length;
  for (let i = 0; i < n; i++) if (ids.some((id) => round.scores[id]?.[i] == null)) return i + 1;
  return n;
}
