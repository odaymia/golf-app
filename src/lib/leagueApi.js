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
  if (/event_scores/.test(msg) && /row-level security/i.test(msg))
    return "You can only enter scores for your own group. Ask the commissioner if your group is wrong.";
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

// Members without an account are invited (by email) or legacy name-only
// spots; only members with an account can be grouped, matched or scored.
const MEMBER_COLUMNS = 'id, league_id, user_id, name, ghin_number, handicap_index, team, role, created_at';

const toMember = (r) => ({
  id: r.id,
  userId: r.user_id,
  active: !!r.user_id,
  inviteEmail: '',
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
  groups: r.groups ?? [],
  teeSheet: r.tee_sheet ?? null,
  sideGames: r.side_games ?? null,
  status: r.status,
  tier: r.tier ?? 'regular',
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
      call(supabase.from('league_members').select(MEMBER_COLUMNS).eq('league_id', id).order('created_at')),
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
    // Commissioners also see who's been invited by email (others can't).
    const invites = await supabase.rpc('league_invites', { p_league: id });
    if (!invites.error) {
      const byId = Object.fromEntries((invites.data ?? []).map((r) => [r.member_id, r.email]));
      data.members = data.members.map((m) => (byId[m.id] ? { ...m, inviteEmail: byId[m.id] } : m));
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

// Deletes the league and (by cascade) its members, rounds and scores.
// Row level security lets only a commissioner do it; anyone else deletes 0 rows.
export async function deleteLeague(id) {
  const rows = await call(supabase.from('leagues').delete().eq('id', id).select('id'));
  if (!rows?.length) throw new Error('Only the commissioner can delete this league.');
  try {
    localStorage.removeItem(`${CACHE}${id}`);
  } catch {
    // nothing cached
  }
}

// --- Members ---------------------------------------------------------------

const memberRow = (m) => ({
  name: m.name.trim(),
  handicap_index: m.index,
  ghin_number: m.ghinNumber?.trim() || null,
  team: m.team?.trim() || null,
});

// Invite a player by email. They join the spot when they sign in with it.
export function addMember(leagueId, m) {
  return call(
    supabase.from('league_members').insert({ league_id: leagueId, ...memberRow(m), invite_email: m.email?.trim().toLowerCase() || null }),
  );
}

// Add Scribble members straight to the league, linked to their accounts
// (golfers: [{ id: userId, name, index }]). People already in are skipped.
// Returns how many were added.
export async function addAccounts(leagueId, golfers, members) {
  const have = new Set(members.map((m) => m.userId).filter(Boolean));
  const rows = golfers
    .filter((g) => !have.has(g.id))
    .map((g) => ({ league_id: leagueId, user_id: g.id, name: g.name.trim().slice(0, 60), handicap_index: g.index ?? null, role: 'member' }));
  if (rows.length) await call(supabase.from('league_members').insert(rows));
  return rows.length;
}

// Invite many at once (roster import).
export function addMembers(leagueId, list) {
  return call(
    supabase.from('league_members').insert(
      list.map((m) => ({ league_id: leagueId, ...memberRow(m), invite_email: m.email?.trim().toLowerCase() || null })),
    ),
  );
}

export function updateMember(id, m) {
  const row = memberRow(m);
  if ('email' in m) row.invite_email = m.email?.trim().toLowerCase() || null;
  return call(supabase.from('league_members').update(row).eq('id', id));
}

// Link spots I've been invited to by email (after sign-in). Quietly 0 if
// the invite system isn't set up yet.
export async function claimMyInvites() {
  const { data, error } = await supabase.rpc('claim_my_invites');
  return error ? 0 : data ?? 0;
}

export const inviteLink = (code) => `https://scribblegolfclub.com/app/?join=${code}`;

export function setMemberRole(id, role) {
  return call(supabase.from('league_members').update({ role }).eq('id', id));
}

export function removeMember(id) {
  return call(supabase.from('league_members').delete().eq('id', id));
}

// --- Events ----------------------------------------------------------------

export async function createEvent(leagueId, { name, date, course, tier = 'regular' }) {
  const row = await call(
    supabase
      .from('league_events')
      .insert({ league_id: leagueId, name, event_date: date || null, course, ...(tier !== 'regular' ? { tier } : {}) })
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
  if ('tier' in patch) row.tier = patch.tier;
  if ('groups' in patch) row.groups = patch.groups;
  if ('teeSheet' in patch) row.tee_sheet = patch.teeSheet;
  if ('sideGames' in patch) row.side_games = patch.sideGames;
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
