// League format options: what the builder offers and plain-English labels.
// Pure data + validation, no React.

export const UNITS = {
  individual: { label: 'Single players', help: 'Everyone plays their own ball and is ranked on their own.' },
  teams: { label: 'Teams', help: 'Fixed teams of 2 or 4. Teams are ranked or play matches against each other.' },
  ryder: {
    label: 'Ryder Cup',
    help: 'Two sides. Each round is a set of matches (1 vs 1 or 2 vs 2). A win is 1 point, a halve ½.',
  },
};

export const SCORING = {
  stroke: { label: 'Stroke play', help: 'Lowest total score wins.' },
  stableford: {
    label: 'Stableford',
    help: 'Points per hole: bogey 1, par 2, birdie 3, eagle 4. Most points wins. A blow-up hole only costs you that hole.',
  },
  match: { label: 'Match play', help: 'Head to head. Win more holes than your opponent to win the match.' },
};

export const SEASONS = {
  points: {
    label: 'Season points',
    help: 'Each week earns points by finish (1st, 2nd…). Most points at the end wins.',
  },
  cumulative: {
    label: 'Season total',
    help: 'Stableford: all your points added up. Stroke play: lowest average score.',
  },
  record: {
    label: 'Win / loss record',
    help: 'Every match is a win, loss or tie. Standings by points (win 2, tie 1 by default).',
  },
  ryder: { label: 'Cup points', help: 'Match points add up for each side over the season. Most points wins the Cup.' },
};

// Points by finish, modeled on the FedEx Cup: the winner gets 500 at a
// regular event, the curve drops steeply through the top places, and majors
// pay more (on Tour a major pays 750 to win, i.e. 1.5x).
const FEDEX_SHAPE = [1, 0.6, 0.38, 0.27, 0.22, 0.2, 0.18, 0.17, 0.16, 0.15, 0.14, 0.13, 0.12];

export const POINT_PRESETS = {
  fedex: { label: 'FedEx Cup style', help: '500 to the winner, big drop after the top few.' },
  even: { label: 'Even steps', help: 'Every place is worth 10 more than the one behind it.' },
  custom: { label: 'Custom', help: 'Type your own points for each place.' },
};

export const MAJOR_MULTIPLIERS = [1.25, 1.5, 2, 3];

export function presetTable(preset, places) {
  const n = Math.max(1, places);
  if (preset === 'even') return Array.from({ length: n }, (_, i) => (n - i) * 10);
  return Array.from({ length: n }, (_, i) => {
    const f = i < FEDEX_SHAPE.length ? FEDEX_SHAPE[i] : Math.max(0.02, FEDEX_SHAPE.at(-1) - (i - FEDEX_SHAPE.length + 1) * 0.01);
    return Math.round(500 * f);
  });
}

// How many finishing places get points: players, or teams in a team league.
export function placesFor(settings) {
  const field = Math.max(2, settings.fieldSize ?? 8);
  return settings.unit === 'teams' ? Math.max(2, Math.ceil(field / settings.teamSize)) : field;
}

// Points table for a round: regular, or scaled up for a major.
export function tableForTier(settings, tier) {
  const base = settings.pointsTable ?? [];
  if (tier !== 'major') return base;
  const mult = settings.majorMultiplier ?? 1.5;
  return base.map((p) => Math.round(p * mult));
}

// Which scoring and season choices fit each unit.
export function scoringOptions(unit) {
  return unit === 'ryder' ? ['match'] : ['stroke', 'stableford', 'match'];
}

export function seasonOptions(unit, scoring) {
  if (unit === 'ryder') return ['ryder'];
  if (scoring === 'match') return ['record'];
  return ['points', 'cumulative'];
}

export function defaultLeagueSettings() {
  return {
    unit: 'individual',
    teamSize: 2,
    sides: ['USA', 'Europe'],
    scoring: 'stroke',
    net: true,
    teamScore: 'bestBall', // bestBall | aggregate (team stroke / stableford)
    season: 'points',
    fieldSize: 8, // players in the league; sets how many places earn points
    pointsPreset: 'fedex',
    pointsTable: presetTable('fedex', 8),
    majorMultiplier: 1.5,
    bestOf: null, // count only the best N weeks (points / cumulative)
    record: { win: 2, tie: 1, loss: 0 },
    handicap: {
      mode: 'index', // index | league
      allowance: 100,
      maxHandicap: null,
      offLow: true, // match play: strokes off the low player in each match
      best: 4, // league handicap: average of best N...
      of: 8, // ...of the last M league rounds
      minRounds: 3, // until then use the player's own index
    },
  };
}

// Saved settings -> complete settings. Leagues made before presets existed
// keep their own points table as a custom one.
export function leagueSettings(raw = {}) {
  const legacy = raw.pointsTable && !raw.pointsPreset ? { pointsPreset: 'custom', fieldSize: raw.pointsTable.length } : {};
  return normalizeSettings({ ...defaultLeagueSettings(), ...raw, ...legacy });
}

// Keep settings consistent after any change in the builder.
export function normalizeSettings(s) {
  const out = { ...s, handicap: { ...s.handicap }, record: { ...s.record } };
  if (!scoringOptions(out.unit).includes(out.scoring)) out.scoring = scoringOptions(out.unit)[0];
  if (!seasonOptions(out.unit, out.scoring).includes(out.season)) out.season = seasonOptions(out.unit, out.scoring)[0];
  if (out.unit !== 'teams') out.teamSize = 2;
  if (![2, 4].includes(out.teamSize)) out.teamSize = 2;
  // Keep one points row per finishing place.
  const places = placesFor(out);
  const table = out.pointsTable ?? [];
  if (out.pointsPreset !== 'custom') out.pointsTable = presetTable(out.pointsPreset ?? 'fedex', places);
  else if (table.length !== places)
    out.pointsTable = Array.from({ length: places }, (_, i) => table[i] ?? 0);
  return out;
}

export function describeLeague(s) {
  const who =
    s.unit === 'ryder' ? `Ryder Cup: ${s.sides[0]} vs ${s.sides[1]}` : s.unit === 'teams' ? `${s.teamSize}-player teams` : 'Single players';
  const how = `${s.net ? 'Net' : 'Gross'} ${SCORING[s.scoring].label.toLowerCase()}`;
  const season = SEASONS[s.season].label;
  return `${who} · ${how} · ${season}`;
}
