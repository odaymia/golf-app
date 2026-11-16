// Side games (bets) for a league or tournament round: skins, Stableford
// points and stroke play across the whole field, each group scoring on its
// own phone. Pure: reuses the casual-round money engine (games/round.js),
// so every rule and the integer-cents, zero-sum checks are the same.
//
// event.sideGames (league_events.side_games):
//   { skins: { on, net, carryover, mode: 'pot'|'perSkin', buyIn, stake },
//     stableford: { on, net, mode: 'perPoint'|'perPlayer', stake },
//     stroke: { on, net, mode: 'perOpponent'|'perStroke', stake },
//     players: [memberId] | null }        // null = everyone playing the round
// Stakes and buy-ins are in dollars (as typed); the engine works in cents.

import { buildGames, defaultSettings } from '../roundSetup.js';
import { computeRound } from '../games/round.js';

export const SIDE_GAME_TYPES = ['skins', 'stableford', 'stroke'];

export function defaultSideGames() {
  return {
    skins: { on: false, net: true, carryover: true, mode: 'pot', buyIn: 10, stake: 1 },
    stableford: { on: false, net: true, mode: 'perPoint', stake: 1 },
    stroke: { on: false, net: true, mode: 'perOpponent', stake: 5 },
    players: null,
  };
}

export function normalizeSideGames(sg) {
  const d = defaultSideGames();
  if (!sg || typeof sg !== 'object') return d;
  const out = { players: Array.isArray(sg.players) ? sg.players : null };
  for (const t of SIDE_GAME_TYPES) out[t] = { ...d[t], ...(sg[t] ?? {}) };
  return out;
}

export const anySideGames = (sg) => SIDE_GAME_TYPES.some((t) => sg?.[t]?.on);

// Who's in: the chosen players, or everyone in the league who is playing.
export function sideGamePlayers(sg, members) {
  const active = members.filter((m) => m.active !== false);
  if (!sg.players) return active;
  return active.filter((m) => sg.players.includes(m.id));
}

// Run the side games for one round.
// indexes: { memberId: handicap index used this round } (league handicaps or own index)
// Returns null if no game is on or fewer than 2 players are in; otherwise the
// computeRound result plus { players, holesCounted }.
export function computeSideGames({ event, members, scores = {}, indexes = {}, handicap = {} }) {
  const sg = normalizeSideGames(event.sideGames);
  if (!anySideGames(sg)) return null;
  const inPlay = sideGamePlayers(sg, members);
  if (inPlay.length < 2) return null;

  const players = inPlay.map((m) => ({ id: m.id, name: m.name, index: indexes[m.id] ?? m.index ?? 0 }));
  const settings = defaultSettings();
  for (const t of SIDE_GAME_TYPES) settings[t] = { ...settings[t], ...sg[t] };
  settings.stableford.format = 'each';
  const holes = event.course.holes;
  const round = {
    course: { id: event.id, name: event.course.name, holes },
    tee: event.course.tee,
    players,
    handicap: { allowance: handicap.allowance ?? 100, offLow: handicap.offLow !== false },
    games: buildGames(settings, players),
    scores: Object.fromEntries(players.map((p) => [p.id, (scores[p.id] ?? holes.map(() => null)).slice(0, holes.length)])),
  };
  const result = computeRound(round);
  return { ...result, players };
}
