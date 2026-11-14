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

export const DEFAULT_POINTS_TABLE = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

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
    pointsTable: DEFAULT_POINTS_TABLE.slice(),
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

// Keep settings consistent after any change in the builder.
export function normalizeSettings(s) {
  const out = { ...s, handicap: { ...s.handicap }, record: { ...s.record } };
  if (!scoringOptions(out.unit).includes(out.scoring)) out.scoring = scoringOptions(out.unit)[0];
  if (!seasonOptions(out.unit, out.scoring).includes(out.season)) out.season = seasonOptions(out.unit, out.scoring)[0];
  if (out.unit !== 'teams') out.teamSize = 2;
  if (![2, 4].includes(out.teamSize)) out.teamSize = 2;
  return out;
}

export function describeLeague(s) {
  const who =
    s.unit === 'ryder' ? `Ryder Cup: ${s.sides[0]} vs ${s.sides[1]}` : s.unit === 'teams' ? `${s.teamSize}-player teams` : 'Single players';
  const how = `${s.net ? 'Net' : 'Gross'} ${SCORING[s.scoring].label.toLowerCase()}`;
  const season = SEASONS[s.season].label;
  return `${who} · ${how} · ${season}`;
}
