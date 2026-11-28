// Shared casual rounds in Supabase (supabase/casual_rounds.sql). The only
// code touching casual_rounds / casual_round_players / casual_entries.
// The round itself still lives on the phone (lib/storage.js); changes wait
// in a localStorage queue and are sent when there's signal. Merge rules are
// pure, in lib/casualSync.js.
import { supabase } from './supabase.js';
import { deleteRound, listRounds, saveRound } from './storage.js';
import { applyEntries, diffEntries, mergeServer, roundFromServer, roundGroups, seedKnown, setupOf } from './casualSync.js';

const QUEUE = 'golf-app:casual-queue'; // { creations: {id: {...}}, entries: {'round|key': {...}} }
const KNOWN = 'golf-app:casual-known:';

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked
  }
};
const queue = () => {
  const q = read(QUEUE, {});
  return { creations: q.creations ?? {}, entries: q.entries ?? {} };
};
const isOffline = (e) => /fetch|network|Load failed|Failed to fetch/i.test(e?.message ?? String(e));

// Errors carry `offline`; `refused` only when our SQL said no (raise
// exception, code P0001). Anything else (no signal, sign-in expired, SQL file
// not run yet) keeps the queue so nothing typed is lost.
async function rpc(name, args) {
  let res;
  try {
    res = await supabase.rpc(name, args);
  } catch (e) {
    throw Object.assign(new Error(e.message), { offline: isOffline(e) });
  }
  if (res.error)
    throw Object.assign(new Error(res.error.message), { offline: isOffline(res.error), refused: res.error.code === 'P0001' });
  return res.data;
}

const readKnown = (id) => read(KNOWN + id, null);
const writeKnown = (id, known) => write(KNOWN + id, known);

// Start sharing a new round: queue it for the server and send.
export function shareRound(round) {
  const groups = roundGroups(round);
  const q = queue();
  q.creations[round.id] = {
    id: round.id,
    setup: setupOf(round),
    players: round.players.map((p) => ({
      player_id: p.id,
      user_id: p.userId,
      grp: groups.findIndex((g) => g.includes(p.id)),
    })),
  };
  write(QUEUE, q);
  writeKnown(round.id, {});
  trackLocal(round);
}

// Called on every change to a shared round (App): queue what changed.
export function trackLocal(round) {
  if (!round?.shared) return;
  let known = readKnown(round.id);
  if (!known) {
    // Record lost (storage cleared): start from what's shown, at time 0.
    writeKnown(round.id, seedKnown(round));
    return;
  }
  const diff = diffEntries(known, round);
  if (!diff.changes.length) return;
  writeKnown(round.id, diff.known);
  const q = queue();
  for (const c of diff.changes) q.entries[`${round.id}|${c.key}`] = { round: round.id, ...c };
  write(QUEUE, q);
  flushSoon();
}

let timer = null;
function flushSoon() {
  clearTimeout(timer);
  timer = setTimeout(() => flushCasual().catch(() => {}), 400);
}

let inFlight = null;
// Send queued rounds, then changes. No signal (or any other trouble): stop
// and keep them. Refused by the rules (round deleted, not a player): drop
// them so they can't block the rest.
export function flushCasual() {
  if (!inFlight) inFlight = doFlush().finally(() => (inFlight = null));
  return inFlight;
}

async function doFlush() {
  const { creations, entries } = queue();
  const notCreated = new Set();
  for (const c of Object.values(creations)) {
    try {
      await rpc('create_casual_round', { p_id: c.id, p_setup: c.setup, p_players: c.players });
    } catch (e) {
      if (!e.refused) throw e;
      console.warn('Round refused', e.message);
      notCreated.add(c.id);
    }
    const q = queue();
    delete q.creations[c.id];
    write(QUEUE, q);
  }
  const byRound = {};
  for (const [k, e] of Object.entries(entries)) (byRound[e.round] ??= []).push([k, e]);
  for (const [roundId, list] of Object.entries(byRound)) {
    if (!notCreated.has(roundId)) {
      try {
        await rpc('put_casual_entries', {
          p_round: roundId,
          p_entries: list.map(([, e]) => ({ key: e.key, value: e.value, at: e.at })),
        });
      } catch (e) {
        if (!e.refused) throw e;
        console.warn('Scores refused', e.message);
      }
    }
    // Drop only what was sent; a newer edit made meanwhile stays queued.
    const q = queue();
    for (const [k, e] of list) if (q.entries[k]?.at === e.at) delete q.entries[k];
    write(QUEUE, q);
  }
}

// How many changes on this phone are still waiting to be sent for a round.
export function pendingCount(roundId) {
  const { creations, entries } = queue();
  return (creations[roundId] ? 1 : 0) + Object.values(entries).filter((e) => e.round === roundId).length;
}

// Fetch the latest for one round. Returns { gone } if it was deleted, or
// { changed } ({key: value}, maybe empty) to put on the round with applyEntries.
export async function pullRound(round) {
  await flushCasual().catch(() => {});
  if (queue().creations[round.id]) return { changed: {} };
  const { data, error } = await supabase
    .from('casual_rounds')
    .select('id, casual_entries(key, value, at)')
    .eq('id', round.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { gone: true };
  const { known, changed } = mergeServer(readKnown(round.id) ?? seedKnown(round), data.casual_entries);
  writeKnown(round.id, known);
  return { changed };
}

// Home: bring this phone's list up to date with the shared rounds I'm in.
// New rounds are saved, changed ones merged, deleted/hidden ones removed.
// Returns true when anything on the phone changed.
export async function pullMyRounds(userId) {
  if (!userId) return false;
  await flushCasual().catch(() => {});
  const { data: mine, error } = await supabase
    .from('casual_round_players')
    .select('round_id, hidden')
    .eq('user_id', userId)
    .limit(500);
  if (error) throw error;
  const visible = mine.filter((m) => !m.hidden).map((m) => m.round_id);
  const hidden = new Set(mine.filter((m) => m.hidden).map((m) => m.round_id));
  const { data: rounds, error: e2 } = visible.length
    ? await supabase.from('casual_rounds').select('id, owner_id, setup, created_at, updated_at').in('id', visible)
    : { data: [], error: null };
  if (e2) throw e2;

  const local = Object.fromEntries((await listRounds()).map((r) => [r.id, r]));
  const pendingNew = queue().creations;
  let touched = false;
  // Gone from the server (deleted by its creator) or hidden by me.
  const onServer = new Set(rounds.map((r) => r.id));
  for (const r of Object.values(local)) {
    if (!r.shared || pendingNew[r.id]) continue;
    if (hidden.has(r.id) || (!onServer.has(r.id) && mine.length < 500)) {
      await forget(r.id);
      touched = true;
    }
  }
  const stale = rounds.filter((s) => !local[s.id] || local[s.id].syncedAt !== s.updated_at);
  if (!stale.length) return touched;
  for (const s of stale) {
    // One round at a time (a big round is ~450 rows; the API caps a reply at 1000).
    const { data: rows, error: e3 } = await supabase
      .from('casual_entries')
      .select('key, value, at')
      .eq('round_id', s.id);
    if (e3) throw e3;
    if (!local[s.id]) {
      const { round, known } = roundFromServer(s, rows);
      writeKnown(s.id, known);
      await saveRound({ ...round, syncedAt: s.updated_at });
    } else {
      const { known, changed } = mergeServer(readKnown(s.id) ?? seedKnown(local[s.id]), rows);
      writeKnown(s.id, known);
      await saveRound({ ...applyEntries(local[s.id], changed), syncedAt: s.updated_at });
    }
    touched = true;
  }
  return touched;
}

// Take a round off this phone (and its queued changes).
export async function forget(id) {
  await deleteRound(id);
  try {
    localStorage.removeItem(KNOWN + id);
  } catch {
    // blocked
  }
  const q = queue();
  delete q.creations[id];
  for (const k of Object.keys(q.entries)) if (q.entries[k].round === id) delete q.entries[k];
  write(QUEUE, q);
}

// Delete from Home: the creator deletes it for everyone, anyone else takes it
// off their own list. Needs signal for a round already on the server.
export async function removeSharedRound(round, userId) {
  const q = queue();
  if (q.creations[round.id]) return forget(round.id); // never left this phone
  if (round.ownerId === userId) {
    const { error } = await supabase.from('casual_rounds').delete().eq('id', round.id);
    if (error) throw new Error(isOffline(error) ? 'No connection. Try again when you have signal.' : error.message);
  } else {
    try {
      await rpc('hide_casual_round', { p_round: round.id });
    } catch (e) {
      throw new Error(e.offline ? 'No connection. Try again when you have signal.' : e.message);
    }
  }
  await forget(round.id);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushCasual().catch(() => {}));
}
