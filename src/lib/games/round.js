import { playingHandicaps, strokeTable } from './handicap.js';
import { emptyBalances, addBalances, sumBalances } from './money.js';
import { scoreMatchPlay } from './match.js';
import { scoreStrokePlay } from './stroke.js';
import { scoreNassau } from './nassau.js';
import { scoreSkins } from './skins.js';
import { scoreWolf } from './wolf.js';
import { scoreVegas } from './vegas.js';
import { scoreStableford } from './stableford.js';
import { scorePlaces } from './places.js';
import { settle } from './settle.js';

// round = {
//   course:   { name, holes: [{ par, hcp }] },
//   tee:      { name, rating, slope },
//   players:  [{ id, name, index }],
//   handicap: { allowance: 100, offLow: false },
//   games:    [{ id, type, ...config }],
//   scores:   { playerId: [gross | null, ...] },
// }

export const SCORERS = {
  match: scoreMatchPlay,
  stroke: scoreStrokePlay,
  nassau: scoreNassau,
  skins: scoreSkins,
  wolf: scoreWolf,
  vegas: scoreVegas,
  stableford: scoreStableford,
  places: scorePlaces,
};

export function coursePar(holes) {
  return holes.reduce((s, h) => s + h.par, 0);
}

export function buildContext(round) {
  const holes = round.course.holes;
  const playing = playingHandicaps(round.players, round.tee, coursePar(holes), round.handicap);
  return {
    players: round.players,
    holes,
    gross: round.scores,
    playing,
    strokes: strokeTable(playing, holes),
  };
}

// Only holes from..to (1-based) of a round, keeping each player's strokes
// from the full-round allocation (a 6-hole stretch still gets the strokes
// those holes get over 18).
export function sliceContext(ctx, from, to) {
  const cut = (arr) => (arr ?? []).slice(from - 1, to);
  return {
    ...ctx,
    holes: cut(ctx.holes),
    gross: Object.fromEntries(Object.entries(ctx.gross).map(([id, g]) => [id, cut(g)])),
    strokes: Object.fromEntries(Object.entries(ctx.strokes).map(([id, st]) => [id, cut(st)])),
  };
}

// Everything the UI needs: strokes, each game's result, totals, payments.
// range (optional): { from, to } to play the games on those holes only.
export function computeRound(round, range = null) {
  const full = buildContext(round);
  const ctx = range ? sliceContext(full, range.from, range.to) : full;
  const ids = round.players.map((p) => p.id);
  const totals = emptyBalances(ids);
  const games = round.games.map((game) => {
    const scorer = SCORERS[game.type];
    if (!scorer) throw new Error(`Unknown game: ${game.type}`);
    const result = scorer(ctx, game);
    if (sumBalances(result.balances) !== 0) {
      throw new Error(`${game.type} balances do not net to zero`);
    }
    addBalances(totals, result.balances);
    return { game, ...result };
  });
  const holesComplete = ctx.holes.filter((_, h) => ids.every((id) => ctx.gross[id]?.[h] != null)).length;
  return {
    playing: ctx.playing,
    strokes: ctx.strokes,
    games,
    totals,
    payments: settle(totals, ids),
    holesComplete,
    finished: holesComplete === ctx.holes.length,
  };
}
