// Pairings and tee times for a league round. Pure: no React, network or storage.
//
// Pairing methods (how the commissioner orders players before grouping):
//   manual     the commissioner picks every group
//   random     a fresh random draw
//   last       by the previous round's finish (players who didn't play it
//              follow, in season-standings order)
//   standings  by season standings (tournaments: the live leaderboard)
// direction: 'leaders-last' puts first place in the last group (leaders go
// off last, like a tour Sunday); 'leaders-first' puts them in group 1.
// Team formats keep teammates together and order by the team's finish.
//
// Tee sheet (league_events.tee_sheet):
//   { mode: 'tee' | 'shotgun', start: 'HH:MM', interval: minutes,
//     slots: [label per group, '' = use the generated one] }
// Tee times: group 1 at start, then every `interval` minutes.
// Shotgun: everyone starts at `start`; group i starts on hole i+1. With more
// groups than holes, the first holes take two groups (1A, 1B, 2A, 2B, ...).

import { autoGroups } from './groups.js';
import { orderEvents } from './season.js';

export const PAIRING_METHODS = {
  manual: { label: 'Pick them myself', short: 'Manual' },
  random: { label: 'Random draw', short: 'Random' },
  last: { label: 'Last round’s results', short: 'Last round' },
  standings: { label: 'Season standings', short: 'Standings' },
};

export const DEFAULT_TEE_SHEET = { mode: 'tee', start: '08:00', interval: 10, slots: [] };

export function normalizeTeeSheet(sheet) {
  const s = { ...DEFAULT_TEE_SHEET, ...(sheet && typeof sheet === 'object' ? sheet : {}) };
  if (!['tee', 'shotgun'].includes(s.mode)) s.mode = 'tee';
  if (!/^\d{1,2}:\d{2}$/.test(s.start ?? '')) s.start = DEFAULT_TEE_SHEET.start;
  s.interval = Math.max(1, Math.min(60, Math.round(Number(s.interval) || 10)));
  s.slots = Array.isArray(s.slots) ? s.slots.map((x) => (typeof x === 'string' ? x : '')) : [];
  return s;
}

// The round before this one (by date, then id), or null.
export function previousEvent(events, event) {
  const ordered = orderEvents(events).filter((e) => e.id !== event.id);
  const before = ordered.filter((e) => (e.date ?? '') < (event.date ?? '') || (e.date === event.date && e.id < event.id));
  return before.at(-1) ?? null;
}

const keyOf = (settings, m) => (settings.unit === 'individual' ? m.id : m.team || m.id);

// Fisher-Yates with an injectable random source (tests pass a seeded one).
export function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Rank map { entityKey: position } from standings rows or a round's board.
// Rows without a position (no scores yet) are left out.
function positions(rows) {
  const out = {};
  for (const r of rows ?? []) if (r.position != null && out[r.key] == null) out[r.key] = r.position;
  return out;
}

// Order player ids for grouping.
// players: members to pair (active only); standings: season rows;
// lastBoard: previous round's result.board (or null).
export function pairingOrder({ method, direction = 'leaders-last', players, settings, standings = [], lastBoard = null, random = Math.random }) {
  if (method === 'random') {
    if (settings.unit === 'individual') return shuffle(players.map((m) => m.id), random);
    // Teams: draw the teams, keep partners together.
    const teams = shuffle([...new Set(players.map((m) => keyOf(settings, m)))], random);
    return teams.flatMap((t) => players.filter((m) => keyOf(settings, m) === t).map((m) => m.id));
  }
  if (method !== 'last' && method !== 'standings') return players.map((m) => m.id);

  const season = positions(standings);
  const primary = method === 'last' ? positions(lastBoard) : season;
  const big = Number.MAX_SAFE_INTEGER;
  const rankOf = (m) => {
    const k = keyOf(settings, m);
    return [primary[k] ?? big, season[k] ?? big];
  };
  const sorted = [...players].sort((a, b) => {
    const [pa, sa] = rankOf(a);
    const [pb, sb] = rankOf(b);
    return (
      pa - pb ||
      sa - sb ||
      String(keyOf(settings, a)).localeCompare(String(keyOf(settings, b))) ||
      a.name.localeCompare(b.name)
    );
  });
  // Unranked players stay at the end either way; only ranked ones flip.
  const ranked = sorted.filter((m) => rankOf(m)[0] !== big || rankOf(m)[1] !== big);
  const unranked = sorted.filter((m) => !ranked.includes(m));
  const ids = (list) => list.map((m) => m.id);
  if (direction === 'leaders-last') {
    // Reverse by team block so partners stay together.
    const blocks = [];
    for (const m of ranked) {
      const k = keyOf(settings, m);
      if (blocks.length && blocks.at(-1).key === k) blocks.at(-1).list.push(m);
      else blocks.push({ key: k, list: [m] });
    }
    return [...ids(unranked), ...blocks.reverse().flatMap((b) => ids(b.list))];
  }
  return [...ids(ranked), ...ids(unranked)];
}

// Groups from an ordered list. blockOf(id) names a block that must stay in
// one group (a team, or a match); omit it for individuals. Blocks are packed
// in order without splitting; a block bigger than a group is split.
export function makeGroups(order, size = 4, blockOf = null) {
  if (!blockOf) return autoGroups(order, size);
  const blocks = [];
  for (const id of order) {
    const k = blockOf(id);
    if (blocks.length && blocks.at(-1).key === k) blocks.at(-1).ids.push(id);
    else blocks.push({ key: k, ids: [id] });
  }
  const pieces = blocks.flatMap((b) => (b.ids.length > size ? autoGroups(b.ids, size) : [b.ids]));
  const groups = [];
  for (const ids of pieces) {
    const last = groups.at(-1);
    if (last && last.length + ids.length <= size) last.push(...ids);
    else groups.push([...ids]);
  }
  // A lone leftover joins the smallest group that has room.
  if (groups.length > 1 && groups.at(-1).length === 1) {
    const room = groups.slice(0, -1).filter((g) => g.length < size).sort((x, y) => x.length - y.length)[0];
    if (room) room.push(groups.pop()[0]);
  }
  return groups;
}

// Singles matches from an ordered list: neighbours play (1 v 2, 3 v 4, ...).
// Returns { matchups, bye } where bye is the odd player out (or null).
export function makeSinglesMatches(order) {
  const matchups = [];
  for (let i = 0; i + 1 < order.length; i += 2) matchups.push({ sides: [[order[i]], [order[i + 1]]], format: 'singles' });
  return { matchups, bye: order.length % 2 ? order.at(-1) : null };
}

// Team matches from ordered team keys: neighbours play.
export function makeTeamMatches(teamOrder, playersOf, format) {
  const matchups = [];
  for (let i = 0; i + 1 < teamOrder.length; i += 2)
    matchups.push({ sides: [playersOf(teamOrder[i]), playersOf(teamOrder[i + 1])], format });
  return { matchups, bye: teamOrder.length % 2 ? teamOrder.at(-1) : null };
}

// The playing groups for a round: its groups, or each match when none are set.
export function teeGroups(event) {
  if ((event.groups ?? []).length) return event.groups;
  return (event.matchups ?? []).map((mu) => mu.sides.flat());
}

const pad = (n) => String(n).padStart(2, '0');

// Generated label for group i (0-based): 'HH:MM' for tee times, hole for shotgun.
export function generatedSlot(sheet, i, groupCount, holes = 18) {
  const s = normalizeTeeSheet(sheet);
  if (s.mode === 'shotgun') {
    const doubled = Math.max(0, Math.min(holes, groupCount - holes));
    // First `doubled` holes take two groups each.
    if (i < doubled * 2) return `${Math.floor(i / 2) + 1}${i % 2 ? 'B' : 'A'}`;
    const hole = doubled + (i - doubled * 2) + 1;
    return hole <= holes ? String(hole) : '';
  }
  const [h, m] = s.start.split(':').map(Number);
  const mins = h * 60 + m + i * s.interval;
  return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
}

// Every group with its slot: [{ index, ids, slot }]. Rounds without a tee
// sheet have no tee times (players shouldn't see a default 8:00); pass
// { preview: true } to get the generated ones anyway (commissioner editor).
export function teeSheetRows(event, { preview = false } = {}) {
  if (!event.teeSheet && !preview) return [];
  const groups = teeGroups(event);
  const sheet = normalizeTeeSheet(event.teeSheet);
  const holes = event.course?.holes?.length ?? 18;
  return groups.map((ids, i) => ({ index: i, ids, slot: sheet.slots[i] || generatedSlot(sheet, i, groups.length, holes) }));
}

// '13:05' -> '1:05 PM'. Anything else is returned as is.
export function formatTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  if (!m) return t ?? '';
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

// What a player sees: "8:10 AM" or "Hole 4 · 8:00 AM shotgun", or null.
export function slotLabel(event, slot) {
  if (!slot) return null;
  const sheet = normalizeTeeSheet(event.teeSheet);
  if (sheet.mode === 'shotgun') return `Hole ${slot} · ${formatTime(sheet.start)} shotgun`;
  return formatTime(slot);
}

// A player's tee time and group, or null if they aren't in one.
export function myTeeTime(event, memberId) {
  const row = teeSheetRows(event).find((r) => r.ids.includes(memberId));
  if (!row) return null;
  return { ...row, label: slotLabel(event, row.slot) };
}
