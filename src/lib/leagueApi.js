// League data in Supabase. The only module that reads/writes league tables.
// The last copy of each league is cached on the phone, and scores entered
// with no signal wait in a queue until they can be sent.
import { supabase } from './supabase.js';

const CACHE = 'golf-app:league:';
const QUEUE = 'golf-app:score-queue';

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

const offline = (e) => /fetch|network|Load failed|Failed to fetch/i.test(e?.message ?? String(e));

function friendly(error) {
  const msg = error?.message ?? String(error);
  if (offline(error)) return 'No connection. Try again when you have signal.';
  if (/row-level security|permission/i.test(msg)) return 'Only the commissioner can do that.';
  return msg;
}

async function call(promise) {
  let result;
  try {
    result = await promise;
  } catch (e) {
    const err = new Error(friendly(e));
    err.offline = offline(e);
    throw err;
  }
  if (result.error) {
    const err = new Error(friendly(result.error));
    err.offline = offline(result.error);
    throw err;
  }
  return result.data;
}

const toMember = (r) => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  index: r.handicap_index == null ? null : Number(r.handicap_index),
  ghinNumber: r.ghin_number ?? '',
  team: r.team ?? '',
  role: r.role,
});

const toEvent = (r) => ({
  id: r.id,
  name: r.name,
  date: r.event_date,
  course: r.course,
  matchups: r.matchups ?? [],
  status: r.status,
});

const toLeague = (r) => ({ id: r.id, name: r.name, code: r.invite_code, settings: r.settings, createdAt: r.created_at });

// --- Leagues ---------------------------------------------------------------

export async function listMyLeagues() {
  try {
    const rows = await call(supabase.from('leagues').select('*').order('created_at', { ascending: false }));
    const leagues = rows.map(toLeague);
    write(`${CACHE}list`, leagues);
    return leagues;
  } catch (e) {
    if (e.offline) return read(`${CACHE}list`, []);
    throw e;
  }
}

export function createLeague({ name, settings, profile }) {
  return call(
    supabase.rpc('create_league', {
      p_name: name,
      p_settings: settings,
      p_member_name: profile.name,
      p_index: profile.index,
      p_ghin: profile.ghinNumber || null,
    }),
  );
}

export async function joinLeague(code, profile) {
  try {
    return await call(
      supabase.rpc('join_league', {
        p_code: code,
        p_member_name: profile.name,
        p_index: profile.index,
        p_ghin: profile.ghinNumber || null,
      }),
    );
  } catch (e) {
    if (/No league/i.test(e.message)) throw new Error('No league with that code. Check it with your commissioner.');
    throw e;
  }
}

// Everything for one league: { league, members, events, scores: {eventId: {memberId: gross}} }
export async function loadLeague(id) {
  await flushScores().catch(() => {});
  try {
    const [league, members, events, scores] = await Promise.all([
      call(supabase.from('leagues').select('*').eq('id', id).single()),
      call(supabase.from('league_members').select('*').eq('league_id', id).order('created_at')),
      call(supabase.from('league_events').select('*').eq('league_id', id).order('event_date')),
      call(supabase.from('event_scores').select('event_id, member_id, gross').eq('league_id', id)),
    ]);
    const data = {
      league: toLeague(league),
      members: members.map(toMember),
      events: events.map(toEvent),
      scores: {},
    };
    for (const s of scores) {
      data.scores[s.event_id] = data.scores[s.event_id] ?? {};
      data.scores[s.event_id][s.member_id] = s.gross;
    }
    write(`${CACHE}${id}`, data);
    return withQueued(data);
  } catch (e) {
    const cached = read(`${CACHE}${id}`, null);
    if (e.offline && cached) return { ...withQueued(cached), offline: true };
    throw e;
  }
}

export function updateLeague(id, patch) {
  return call(supabase.from('leagues').update(patch).eq('id', id));
}

export function deleteLeague(id) {
  return call(supabase.from('leagues').delete().eq('id', id));
}

// --- Members ---------------------------------------------------------------

const memberRow = (m) => ({
  name: m.name.trim(),
  handicap_index: m.index,
  ghin_number: m.ghinNumber?.trim() || null,
  team: m.team?.trim() || null,
});

export function addMember(leagueId, m) {
  return call(supabase.from('league_members').insert({ league_id: leagueId, ...memberRow(m) }));
}

export function updateMember(id, m) {
  return call(supabase.from('league_members').update(memberRow(m)).eq('id', id));
}

export function setMemberRole(id, role) {
  return call(supabase.from('league_members').update({ role }).eq('id', id));
}

export function removeMember(id) {
  return call(supabase.from('league_members').delete().eq('id', id));
}

// --- Events ----------------------------------------------------------------

export async function createEvent(leagueId, { name, date, course }) {
  const row = await call(
    supabase
      .from('league_events')
      .insert({ league_id: leagueId, name, event_date: date || null, course })
      .select()
      .single(),
  );
  return toEvent(row);
}

export function updateEvent(id, patch) {
  const row = {};
  if ('name' in patch) row.name = patch.name;
  if ('date' in patch) row.event_date = patch.date || null;
  if ('matchups' in patch) row.matchups = patch.matchups;
  if ('status' in patch) row.status = patch.status;
  if ('course' in patch) row.course = patch.course;
  return call(supabase.from('league_events').update(row).eq('id', id));
}

export function deleteEvent(id) {
  return call(supabase.from('league_events').delete().eq('id', id));
}

// --- Scores (offline-safe) ---------------------------------------------------

function queue() {
  return read(QUEUE, {});
}

// Overlay scores still waiting to be sent, so the phone shows what was entered.
function withQueued(data) {
  const q = queue();
  const scores = structuredClone(data.scores);
  for (const row of Object.values(q)) {
    if (row.league_id !== data.league.id) continue;
    scores[row.event_id] = scores[row.event_id] ?? {};
    scores[row.event_id][row.member_id] = row.gross;
  }
  return { ...data, scores, pending: Object.values(q).filter((r) => r.league_id === data.league.id).length };
}

// Save one member's card. Always lands in the queue first, then sends.
// Returns { sent: boolean }.
export async function saveScore(leagueId, eventId, memberId, gross) {
  const q = queue();
  q[`${eventId}:${memberId}`] = {
    league_id: leagueId,
    event_id: eventId,
    member_id: memberId,
    gross,
    updated_at: new Date().toISOString(),
  };
  write(QUEUE, q);
  try {
    await flushScores();
    return { sent: true };
  } catch {
    return { sent: false };
  }
}

// Send queued cards one by one. No signal: stop and keep them. Refused by the
// server (e.g. the round was marked final): drop that card so it can't block
// the rest. Throws only when offline.
export async function flushScores() {
  const rows = Object.values(queue());
  let sent = 0;
  for (const r of rows) {
    try {
      await call(supabase.from('event_scores').upsert(r, { onConflict: 'event_id,member_id' }));
      sent++;
    } catch (e) {
      if (e.offline) throw e;
      console.warn('Score refused', e.message);
    }
    // Drop only this version; a newer edit made meanwhile stays queued.
    const now = queue();
    const key = `${r.event_id}:${r.member_id}`;
    if (now[key]?.updated_at === r.updated_at) {
      delete now[key];
      write(QUEUE, now);
    }
  }
  return sent;
}

export function pendingScoreCount() {
  return Object.keys(queue()).length;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushScores().catch(() => {}));
}
