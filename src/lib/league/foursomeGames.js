// Foursome side games in a league or tournament round: the players in one
// group set up their own casual games (skins, match play, Nassau, Wolf,
// Vegas, stroke play, Stableford) on any stretch of holes, played off the
// scores they're already entering for the round. Pure: the casual engine
// (games/round.js) does the scoring, so the integer-cents, zero-sum rules
// are the same. Separate from the commissioner's round side games
// (sideGames.js) and from the official leaderboard.
//
// Saved per group (supabase/foursome_games.sql, group_side_games.sets):
//   [{ id, from, to, players: [memberId], settings }]   settings = roundSetup
//   defaultSettings() shape (game switches, stakes, teamsIndex).
// Stakes are dollars as typed; the engine works in cents.

import { buildGames, defaultSettings, gameAvailable } from '../roundSetup.js';
import { computeRound } from '../games/round.js';
import { emptyBalances, addBalances } from '../games/money.js';
import { settle } from '../games/settle.js';
import { isSplit, parseSplit } from './ryder.js';
import { MATCH_FORMATS } from './event.js';

// A foursome's key: its players' ids, sorted, joined with commas.
export const groupKey = (ids) => [...ids].sort().join(',');

export function newSet(players, n = 18, range = null) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    from: range?.from ?? 1,
    to: range?.to ?? n,
    players: players.map((p) => p.id),
    settings: defaultSettings(),
  };
}

// Keep a saved set usable: holes in range, known players, full settings.
export function normalizeSet(set, n = 18, memberIds = null) {
  const d = defaultSettings();
  const from = Math.min(Math.max(1, Number(set?.from) || 1), n);
  const to = Math.min(Math.max(from, Number(set?.to) || n), n);
  const players = (set?.players ?? []).filter((id) => !memberIds || memberIds.includes(id));
  const settings = { ...d, ...(set?.settings ?? {}) };
  for (const k of Object.keys(d)) if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) settings[k] = { ...d[k], ...(settings[k] ?? {}) };
  // Casual split matches don't apply inside a stretch (the round has its own).
  if (settings.match) settings.match = { ...settings.match, split: null };
  return { id: set?.id ?? 'set', from, to, players, settings };
}

// Quick hole choices: all holes, and each stretch of a split round (with its
// format, so players see "1–6 Scramble" and can play games on the rest).
export function holeChoices(event) {
  const n = event.course.holes.length;
  const out = [{ from: 1, to: n, label: `All ${n}` }];
  if (isSplit(event.matchFormat)) {
    const segs = parseSplit(event.matchFormat, n);
    for (const x of segs) out.push({ from: x.from, to: x.to, label: `${x.from}–${x.to} ${MATCH_FORMATS[x.format]?.short ?? ''}`.trim(), teamBall: !!MATCH_FORMATS[x.format]?.teamBall });
    // Everything except a one-ball stretch (e.g. holes 7–18 after a scramble).
    const team = segs.filter((x) => MATCH_FORMATS[x.format]?.teamBall);
    if (team.length === 1 && (team[0].from === 1 || team[0].to === n)) {
      const rest = team[0].from === 1 ? { from: team[0].to + 1, to: n } : { from: 1, to: team[0].from - 1 };
      if (rest.to > rest.from && !out.some((c) => c.from === rest.from && c.to === rest.to)) out.push({ ...rest, label: `${rest.from}–${rest.to}` });
    }
  }
  return out;
}

// Holes of a stretch that are one-ball (scramble / foursomes) in a split
// round: partners share a score there, so individual games are a wash.
export function teamBallHoles(event, from, to) {
  if (!isSplit(event.matchFormat)) return [];
  const segs = parseSplit(event.matchFormat, event.course.holes.length);
  const out = [];
  for (let h = from; h <= to; h++) {
    const seg = segs.find((x) => h >= x.from && h <= x.to);
    if (seg && MATCH_FORMATS[seg.format]?.teamBall) out.push(h);
  }
  return out;
}

const anyOn = (settings, n) => Object.keys(settings).some((k) => settings[k]?.on && gameAvailable(k, n));

// Run every set. members: the group's players [{ id, name, index }];
// scores: { id: gross[] }; indexes: { id: handicap index this round };
// handicap: { allowance, offLow }. Returns { sets: [{ set, round, computed }],
// totals, payments } (totals/payments across all sets, fewest payments).
export function computeFoursomeGames({ event, members, scores = {}, indexes = {}, handicap = {}, sets = [] }) {
  const holes = event.course.holes;
  const n = holes.length;
  const ids = members.map((m) => m.id);
  const out = [];
  const totals = emptyBalances(ids);
  for (const raw of sets) {
    const set = normalizeSet(raw, n, ids);
    const inSet = members.filter((m) => set.players.includes(m.id));
    if (inSet.length < 2 || !anyOn(set.settings, inSet.length)) continue;
    if (set.settings.nassau?.on && set.to - set.from + 1 !== 18) set.settings.nassau = { ...set.settings.nassau, on: false };
    const players = inSet.map((m) => ({ id: m.id, name: m.name, index: indexes[m.id] ?? m.index ?? 0 }));
    const round = {
      course: { id: event.id, name: event.course.name, holes },
      tee: event.course.tee,
      players,
      handicap: { allowance: handicap.allowance ?? 100, offLow: handicap.offLow !== false },
      games: buildGames(set.settings, players),
      scores: Object.fromEntries(players.map((p) => [p.id, holes.map((_, i) => scores[p.id]?.[i] ?? null)])),
    };
    if (!round.games.length) continue;
    const computed = computeRound(round, { from: set.from, to: set.to });
    addBalances(totals, computed.totals);
    // The stretch as its own little round, for the money screens.
    const view = {
      ...round,
      course: { ...round.course, holes: holes.slice(set.from - 1, set.to) },
      scores: Object.fromEntries(players.map((p) => [p.id, round.scores[p.id].slice(set.from - 1, set.to)])),
    };
    out.push({ set, round: view, computed });
  }
  return { sets: out, totals, payments: settle(totals, ids) };
}
