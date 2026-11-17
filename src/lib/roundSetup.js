// Pure helpers for building a round from the setup screen. No React here.
import { dollarsToCents } from './games/money.js';
import { defaultStablefordScoring, normalizeScoring } from './games/stableford.js';

// A typical stroke-index layout: odd numbers on the front, even on the back.
export const DEFAULT_HCPS = [7, 15, 3, 11, 1, 17, 5, 13, 9, 8, 16, 4, 12, 2, 18, 6, 14, 10];
export const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// "Blue · 6,850 yds · 72.4/131" for tee dropdowns.
export const teeLabel = (t, i = 0) =>
  [t.name || `Tee ${i + 1}`, t.yards ? `${Number(t.yards).toLocaleString()} yds` : null, `${t.rating}/${t.slope}`].filter(Boolean).join(' · ');

export function blankCourse() {
  return {
    id: makeId(),
    name: '',
    holes: DEFAULT_PARS.map((par, i) => ({ par, hcp: DEFAULT_HCPS[i] })),
    tees: [{ name: 'White', rating: 72, slope: 113 }],
  };
}

// "12.4" -> 12.4, "+2.1" -> -2.1 (plus handicap), "" -> 0. Invalid -> null.
export function parseIndex(text) {
  const s = String(text ?? '').trim();
  if (s === '') return 0;
  const plus = s.startsWith('+');
  const n = Number(plus ? s.slice(1) : s);
  if (!Number.isFinite(n) || n < -10 || n > 54) return null;
  return plus ? -n : n;
}

export function formatIndex(n) {
  if (n < 0) return `+${-n}`;
  return String(n);
}

// Problems with a course, in plain English. Empty array = good to go.
export function courseProblems(course, tee) {
  const problems = [];
  if (!course.name.trim()) problems.push('Pick a course: search for it, or type its name and add it as a new course.');
  const hcps = course.holes.map((h) => h.hcp);
  const missing = course.holes.map((_, i) => i + 1).filter((n) => !hcps.includes(n));
  if (missing.length) problems.push(`Hole handicaps must use 1–18 once each (missing ${missing.join(', ')}).`);
  if (course.holes.some((h) => h.par < 3 || h.par > 6)) problems.push('Pars must be 3 to 6.');
  if (!(tee.slope >= 55 && tee.slope <= 155)) problems.push('Slope must be between 55 and 155.');
  if (!(tee.rating >= 55 && tee.rating <= 85)) problems.push('Course rating looks off (55–85).');
  return problems;
}

export function teamOptions(players) {
  if (players.length !== 4) return [];
  const [a, b, c, d] = players.map((p) => p.id);
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

export function roundRobin(players) {
  const ids = players.map((p) => p.id);
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) out.push([[ids[i]], [ids[j]]]);
  }
  return out;
}

// Matchups for Nassau / match play. format: 'teams' (2 vs 2 best ball) or
// 'each' (everyone plays everyone). Two players is always 1 vs 1.
export function matchupsFor(players, format, teams) {
  if (players.length === 2) return roundRobin(players);
  if (format === 'teams' && players.length === 4 && teams) return [teams];
  return roundRobin(players);
}

export const GAME_INFO = {
  nassau: {
    name: 'Nassau',
    rules:
      'Three match-play bets: front 9, back 9, and all 18. Win more holes than the other side to win each bet. A press is a new bet that starts mid-nine; auto-press starts one whenever the latest bet goes 2 down.',
  },
  skins: {
    name: 'Skins',
    rules:
      'Lowest score on a hole, all alone, wins the skin. If two or more tie for low, the skin carries to the next hole. Each skin is paid by every other player.',
  },
  match: {
    name: 'Match play',
    rules: 'Win holes, not strokes. Whoever wins more holes wins the match.',
  },
  stroke: {
    name: 'Stroke play',
    rules: 'Lowest total score wins. You collect from every player you beat; ties push.',
  },
  stableford: {
    name: 'Stableford',
    rules:
      'Points for every hole instead of strokes: bogey 1, par 2, birdie 3, eagle 4 (or your own points). Most points wins. Play it every player for themselves or as 2 vs 2 teams.',
  },
  wolf: {
    name: 'Wolf',
    rules:
      'The wolf rotates each hole (player order). The wolf picks a partner after tee shots, or goes Lone Wolf (2× against all three) or Blind Wolf before anyone hits (3×). Low ball wins the hole.',
  },
  vegas: {
    name: 'Vegas',
    rules:
      'Teams of two put their scores together, low first: a 4 and a 5 is 45. Lower number wins the difference in points. Make a birdie and the other team has to flip their number (45 becomes 54).',
  },
};

export function defaultSettings() {
  return {
    handicap: { allowance: 100, offLow: true },
    teamsIndex: 0,
    nassau: { on: false, stake: 5, autoPress: 2, net: true, format: 'teams' },
    skins: { on: false, stake: 1, net: true, carryover: true, validate: false, mode: 'perSkin', buyIn: 10 },
    match: { on: false, stake: 5, net: true, format: 'teams' },
    stroke: { on: false, stake: 5, net: true, mode: 'perOpponent' },
    stableford: {
      on: false,
      stake: 1,
      net: true,
      mode: 'perPoint',
      format: 'each', // each | teams (2 vs 2, four players)
      teamScore: 'bestBall',
      scoring: defaultStablefordScoring(),
    },
    wolf: { on: false, stake: 1, net: true, loneMult: 2, blindMult: 3 },
    vegas: { on: false, stake: 0.1, net: true, birdieFlip: true },
  };
}

// Which games make sense for this many players.
// Does any chosen game play 2 vs 2? (Only then do the teams matter.)
export function usesTeams(settings, playerCount) {
  if (playerCount !== 4) return false;
  return (
    (settings.nassau?.on && settings.nassau.format === 'teams') ||
    (settings.match?.on && settings.match.format === 'teams') ||
    (settings.stableford?.on && settings.stableford.format === 'teams') ||
    !!settings.vegas?.on
  );
}

// A casual round is scored on one phone, for 1 to MAX_PLAYERS players.
export const MAX_PLAYERS = 24;

// How many players each game works for. Pairwise games (Nassau, match play)
// grow fast (everyone vs everyone), so they stop at 6.
export const GAME_LIMITS = {
  nassau: [2, 6],
  match: [2, 6],
  skins: [2, MAX_PLAYERS],
  stroke: [2, MAX_PLAYERS],
  stableford: [2, MAX_PLAYERS],
  wolf: [4, 4],
  vegas: [4, 4],
};

export function gameAvailable(type, playerCount) {
  const [min, max] = GAME_LIMITS[type] ?? [2, 4];
  return playerCount >= min && playerCount <= max;
}

// "needs 4 players", "2–6 players", "needs 2+ players" for unavailable games.
export function gameLimitText(type) {
  const [min, max] = GAME_LIMITS[type] ?? [2, 4];
  if (min === max) return `needs ${min} players`;
  if (max >= MAX_PLAYERS) return `needs ${min}+ players`;
  return `${min}–${max} players`;
}

// Turn setup-screen settings (dollars) into engine game configs (cents).
export function buildGames(settings, players) {
  const teams = teamOptions(players)[settings.teamsIndex ?? 0];
  const games = [];
  const n = players.length;
  const on = (type) => settings[type]?.on && gameAvailable(type, n);

  if (on('nassau')) {
    const s = settings.nassau;
    const stake = dollarsToCents(s.stake);
    games.push({
      id: 'nassau',
      type: 'nassau',
      net: s.net,
      stakes: { front: stake, back: stake, overall: stake },
      autoPress: Number(s.autoPress) || 0,
      pressOverall: false,
      matchups: matchupsFor(players, s.format, teams),
      presses: [],
    });
  }
  if (on('skins')) {
    const s = settings.skins;
    games.push({
      id: 'skins',
      type: 'skins',
      net: s.net,
      carryover: s.carryover,
      validate: s.validate,
      ...(s.mode === 'pot'
        ? { mode: 'pot', buyIn: dollarsToCents(s.buyIn) }
        : { mode: 'perSkin', stake: dollarsToCents(s.stake) }),
    });
  }
  if (on('match')) {
    const s = settings.match;
    games.push({
      id: 'match',
      type: 'match',
      net: s.net,
      stake: dollarsToCents(s.stake),
      matchups: matchupsFor(players, s.format, teams),
    });
  }
  if (on('stroke')) {
    const s = settings.stroke;
    games.push({ id: 'stroke', type: 'stroke', net: s.net, mode: s.mode, stake: dollarsToCents(s.stake) });
  }
  if (on('stableford')) {
    const s = settings.stableford;
    const asTeams = s.format === 'teams' && n === 4 && teams;
    games.push({
      id: 'stableford',
      type: 'stableford',
      net: s.net,
      stake: dollarsToCents(s.stake),
      mode: s.mode,
      scoring: normalizeScoring(s.scoring),
      teams: asTeams ? teams : null,
      teamScore: s.teamScore,
    });
  }
  if (on('wolf')) {
    const s = settings.wolf;
    games.push({
      id: 'wolf',
      type: 'wolf',
      net: s.net,
      stake: dollarsToCents(s.stake),
      loneMult: Number(s.loneMult) || 2,
      blindMult: Number(s.blindMult) || 3,
      order: players.map((p) => p.id),
      decisions: {},
    });
  }
  if (on('vegas')) {
    const s = settings.vegas;
    games.push({
      id: 'vegas',
      type: 'vegas',
      net: s.net,
      stake: dollarsToCents(s.stake),
      teams,
      birdieFlip: s.birdieFlip,
    });
  }
  return games;
}

export function newRound({ course, tee, players, settings }) {
  const now = Date.now();
  return {
    id: makeId(),
    createdAt: now,
    updatedAt: now,
    status: 'active',
    currentHole: 1,
    course: { id: course.id, name: course.name.trim(), holes: course.holes.map((h) => ({ ...h })) },
    tee: { ...tee },
    players: players.map((p) => ({ id: p.id, name: p.name.trim(), index: p.index })),
    handicap: { ...settings.handicap },
    games: buildGames(settings, players),
    scores: Object.fromEntries(players.map((p) => [p.id, course.holes.map(() => null)])),
  };
}
