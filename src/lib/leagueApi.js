// League data in Supabase. The only module that reads/writes league tables.
// The last copy of each league is cached on the phone, and scores entered
// with no signal wait in a queue until they can be sent.
import { supabase } from './supabase.js';
import { formatPoints, formatWithPoints } from './league/ryder.js';

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
  // Added by the commissioner and hasn't accepted yet (supabase/invites.sql).
  pending: r.invite_status === 'pending',
  name: r.name,
  index: r.handicap_index == null ? null : Number(r.handicap_index),
  ghinNumber: r.ghin_number ?? '',
  team: r.team ?? '',
  role: r.role, // 'commissioner' | 'member' | 'viewer' (watching only)
  // false = in the league but not playing: an organizer who isn't playing,
  // or a viewer (supabase/watchers.sql).
  plays: r.plays !== false && r.role !== 'viewer',
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
  // "fourball@2" = 2 points per match (league/ryder.js formatPoints).
  matchFormat: formatPoints(r.match_format).format,
  matchPoints: formatPoints(r.match_format).points,
  status: r.status,
  tier: r.tier ?? 'regular',
  rsvp: r.rsvp ?? {}, // { memberId: true (in) | false (can't make it) }
});

const toLeague = (r) => ({ id: r.id, name: r.name, code: r.invite_code, settings: r.settings, createdAt: r.created_at });

// --- Leagues ---------------------------------------------------------------

export async function listMyLeagues() {
  try {
    const rows = await call(supabase.from('leagues').select('*').order('created_at', { ascending: false }));
    // Which ones I only watch (or run without playing).
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    const mine = uid
      ? await call(supabase.from('league_members').select('league_id, role, plays').eq('user_id', uid)).catch(() => [])
      : [];
    const roleOf = Object.fromEntries(mine.map((m) => [m.league_id, m.role === 'viewer' ? 'watching' : m.plays === false ? 'organizing' : 'playing']));
    const leagues = rows.map((r) => ({ ...toLeague(r), myRole: roleOf[r.id] ?? 'playing' }));
    write(`${CACHE}list`, leagues);
    return leagues;
  } catch (e) {
    if (e.offline) return read(`${CACHE}list`, []);
    throw e;
  }
}

// playing = false: the organizer runs it without playing (watchers.sql).
export async function createLeague({ name, settings, profile, playing = true }) {
  const id = await call(
    supabase.rpc('create_league', {
      p_name: name,
      p_settings: settings,
      p_member_name: profile.name,
      p_index: profile.index,
      p_ghin: profile.ghinNumber || null,
    }),
  );
  if (!playing) {
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (uid) await setPlaying(id, uid, false).catch(() => {});
  }
  return id;
}

// An organizer in or out of the field (my own spot; commissioners only).
export function setPlaying(leagueId, userId, plays) {
  return call(supabase.from('league_members').update({ plays }).eq('league_id', leagueId).eq('user_id', userId)).catch((e) => {
    if (/plays/.test(e.message)) throw new Error('Run supabase/watchers.sql in Supabase first.');
    throw e;
  });
}

// Commissioner: move a spectator into the field as a player.
export function addToField(memberId) {
  return call(supabase.from('league_members').update({ role: 'member', plays: true }).eq('id', memberId));
}

export function stopWatching(leagueId) {
  return call(supabase.rpc('stop_watching', { p_league: leagueId }));
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
      // Newest columns first; older databases fall back (watchers.sql, invites.sql).
      call(supabase.from('league_members').select(`${MEMBER_COLUMNS}, invite_status, plays`).eq('league_id', id).order('created_at'))
        .catch(() => call(supabase.from('league_members').select(`${MEMBER_COLUMNS}, invite_status`).eq('league_id', id).order('created_at')))
        .catch(() => call(supabase.from('league_members').select(MEMBER_COLUMNS).eq('league_id', id).order('created_at'))),
      call(supabase.from('league_events').select('*').eq('league_id', id).order('event_date')),
      call(supabase.from('event_scores').select('event_id, member_id, gross').eq('league_id', id)),
    ]);
    // Each scorekeeper's own cards (to spot disagreements); missing table is fine.
    const entryRows = await call(
      supabase.from('score_entries').select('event_id, member_id, scorer_id, gross').eq('league_id', id),
    ).catch(() => []);
    const everyone = members.map(toMember);
    // Anyone already in a match or with a score card is playing, whatever
    // their switch says (so the scoring never loses a player).
    const inPlay = new Set([
      ...events.flatMap((e) => (e.matchups ?? []).flatMap((mu) => (mu.sides ?? []).flat())),
      ...scores.filter((s) => (s.gross ?? []).some((g) => g != null)).map((s) => s.member_id),
    ]);
    const data = {
      league: toLeague(league),
      // members = players only (standings, groups, matches, cards); people =
      // everyone in it, including organizers not playing and viewers.
      members: everyone.filter((m) => m.plays || inPlay.has(m.id)),
      people: everyone,
      events: events.map(toEvent),
      scores: {},
      entries: {},
    };
    for (const e of entryRows) {
      (data.entries[e.event_id] ??= []).push({ memberId: e.member_id, scorerId: e.scorer_id, gross: e.gross });
    }
    for (const s of scores) {
      data.scores[s.event_id] = data.scores[s.event_id] ?? {};
      data.scores[s.event_id][s.member_id] = s.gross;
    }
    // Commissioners also see who's been invited by email (others can't).
    const invites = await supabase.rpc('league_invites', { p_league: id });
    if (!invites.error) {
      const byId = Object.fromEntries((invites.data ?? []).map((r) => [r.member_id, r.email]));
      data.members = data.members.map((m) => (byId[m.id] ? { ...m, inviteEmail: byId[m.id] } : m));
      data.people = data.people.map((m) => (byId[m.id] ? { ...m, inviteEmail: byId[m.id] } : m));
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

// Put players on a team / Ryder Cup side ('' takes them off).
export function setTeam(memberIds, team) {
  return call(supabase.from('league_members').update({ team: team?.trim() || null }).in('id', memberIds));
}

// Add Scribble members straight to the league, linked to their accounts
// (golfers: [{ id: userId, name, index }]). People already in are skipped.
// Returns how many were added.
export async function addAccounts(leagueId, golfers, members, team = null) {
  const have = new Set(members.map((m) => m.userId).filter(Boolean));
  const rows = golfers
    .filter((g) => !have.has(g.id))
    .map((g) => ({
      league_id: leagueId,
      user_id: g.id,
      name: g.name.trim().slice(0, 60),
      handicap_index: g.index ?? null,
      role: 'member',
      ...(team ? { team } : {}),
    }));
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
  if ('matchFormat' in patch) row.match_format = formatWithPoints(patch.matchFormat, patch.matchPoints);
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
// gross: the official card; mine (optional): this scorekeeper's own numbers,
// kept separately so two scorekeepers can be compared.
// Returns { sent: boolean }.
export async function saveScore(leagueId, eventId, memberId, gross, mine = null) {
  const q = queue();
  q[`${eventId}:${memberId}`] = {
    league_id: leagueId,
    event_id: eventId,
    member_id: memberId,
    gross,
    ...(mine ? { mine } : {}),
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
      const { mine, ...official } = r;
      await call(supabase.from('event_scores').upsert(official, { onConflict: 'event_id,member_id' }));
      if (mine) {
        // My own copy; quietly skipped if the table isn't set up yet.
        await call(
          supabase
            .from('score_entries')
            .upsert(
              { event_id: r.event_id, member_id: r.member_id, league_id: r.league_id, gross: mine, updated_at: r.updated_at },
              { onConflict: 'event_id,member_id,scorer_id' },
            ),
        ).catch((e) => {
          if (e.offline) throw e;
        });
      }
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

// --- Invites, round answers and today's round (home screen) -----------------

// What to show at the top of the home screen for this player:
//   invites: leagues/tournaments that added them and wait for Accept/Decline
//   rounds:  upcoming rounds they're grouped in and haven't answered
//   today:   rounds today they're in (Tee off)
// Fails soft to nothing (offline, or supabase/invites.sql not run yet).
export async function homeLeagueStatus(userId, today) {
  const empty = { invites: [], rounds: [], today: [] };
  if (!userId) return empty;
  try {
    let mine = await call(supabase.from('league_members').select('id, league_id, invite_status, role, plays').eq('user_id', userId))
      .catch(() => call(supabase.from('league_members').select('id, league_id, invite_status').eq('user_id', userId)))
      .catch(() => call(supabase.from('league_members').select('id, league_id').eq('user_id', userId)));
    // Rounds and Tee off only where I play (not watching or organizing).
    mine = mine.filter((m) => m.role !== 'viewer' && m.plays !== false);
    if (!mine.length) return empty;
    const leagueIds = [...new Set(mine.map((m) => m.league_id))];
    const leagues = await call(supabase.from('leagues').select('id, name, settings').in('id', leagueIds));
    const cols = 'id, league_id, name, event_date, status, groups, matchups, tee_sheet, course';
    const evQuery = (c) =>
      supabase.from('league_events').select(c).in('league_id', leagueIds).neq('status', 'final').gte('event_date', today).order('event_date').limit(60);
    const events = await call(evQuery(`${cols}, rsvp`)).catch(() => call(evQuery(cols)));
    const leagueOf = (id) => leagues.find((l) => l.id === id);
    const memberIn = (leagueId) => mine.find((m) => m.league_id === leagueId);
    const invites = mine
      .filter((m) => m.invite_status === 'pending' && leagueOf(m.league_id))
      .map((m) => ({ leagueId: m.league_id, name: leagueOf(m.league_id).name, kind: leagueOf(m.league_id).settings?.kind ?? 'league' }));
    const pendingLeagues = new Set(invites.map((i) => i.leagueId));
    const rows = events.map(toEvent).map((e, i) => ({ ...e, leagueId: events[i].league_id }));
    const inGroup = (e, memberId) => (e.groups ?? []).some((g) => g.includes(memberId)) || (e.matchups ?? []).some((mu) => mu.sides.flat().includes(memberId));
    const todayRounds = [];
    const rounds = [];
    for (const e of rows) {
      const m = memberIn(e.leagueId);
      if (!m || pendingLeagues.has(e.leagueId)) continue;
      const league = leagueOf(e.leagueId);
      const grouped = (e.groups ?? []).length || (e.matchups ?? []).length;
      if (e.date === today && (!grouped || inGroup(e, m.id))) {
        if (!todayRounds.some((t) => t.leagueId === e.leagueId)) todayRounds.push({ leagueId: e.leagueId, leagueName: league.name, event: e, memberId: m.id });
      } else if (e.date > today && inGroup(e, m.id) && e.rsvp?.[m.id] === undefined) {
        rounds.push({ leagueId: e.leagueId, leagueName: league.name, event: e, memberId: m.id });
      }
    }
    return { invites, rounds: rounds.slice(0, 3), today: todayRounds };
  } catch {
    return empty;
  }
}

// Accept or decline a league/tournament spot (declining gives it up).
export function respondLeagueInvite(leagueId, accept) {
  return call(supabase.rpc('respond_league_invite', { p_league: leagueId, p_accept: accept }));
}

// I'm in / can't make it for a round.
export function respondRound(eventId, playing) {
  return call(supabase.rpc('respond_round', { p_event: eventId, p_in: playing }));
}

// --- Foursome side games (supabase/foursome_games.sql) -------------------------

// { sets } for one group in a round, or [] when none / not set up yet.
export async function loadGroupGames(eventId, groupKey) {
  const { data, error } = await supabase.from('group_side_games').select('sets, updated_at').eq('event_id', eventId).eq('group_key', groupKey).maybeSingle();
  if (error) {
    if (/group_side_games/.test(error.message)) throw new Error('Side games aren’t set up yet (run supabase/foursome_games.sql).');
    throw new Error(error.message);
  }
  return data?.sets ?? [];
}

export function saveGroupGames(eventId, groupKey, sets) {
  return call(supabase.from('group_side_games').upsert({ event_id: eventId, group_key: groupKey, sets }, { onConflict: 'event_id,group_key' }));
}
