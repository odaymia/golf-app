// Score lookups shared by every game.
//
// ctx = {
//   players: [{ id, name }],
//   holes:   [{ par, hcp }],          // index 0 = hole 1
//   gross:   { playerId: [score | null, ...] },
//   strokes: { playerId: [strokes, ...] },
// }

export function grossScore(ctx, id, h) {
  const g = ctx.gross?.[id]?.[h];
  return g == null ? null : g;
}

export function netScore(ctx, id, h) {
  const g = grossScore(ctx, id, h);
  if (g == null) return null;
  return g - (ctx.strokes?.[id]?.[h] ?? 0);
}

export function scoreFor(ctx, id, h, useNet) {
  return useNet ? netScore(ctx, id, h) : grossScore(ctx, id, h);
}

// Low score among a team's players, or null until all of them have a score.
export function bestBall(ctx, ids, h, useNet) {
  let best = null;
  for (const id of ids) {
    const s = scoreFor(ctx, id, h, useNet);
    if (s == null) return null;
    if (best == null || s < best) best = s;
  }
  return best;
}

export function holeCount(ctx) {
  return ctx.holes.length;
}
