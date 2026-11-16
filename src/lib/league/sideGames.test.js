import { describe, it, expect } from 'vitest';
import { computeSideGames, normalizeSideGames, sideGamePlayers, anySideGames } from './sideGames.js';

const holes = Array.from({ length: 18 }, (_, i) => ({ par: [4, 4, 3, 5][i % 4], hcp: i + 1 }));
const event = (sideGames) => ({ id: 'e1', course: { name: 'Big Day', holes, tee: { name: 'White', rating: 72, slope: 113 } }, sideGames });
const members = Array.from({ length: 24 }, (_, i) => ({ id: `m${i}`, name: `Player ${i}`, index: (i * 5) % 28, active: true }));
// Every player shoots par, with a birdie on their own "lucky" hole.
const fullScores = Object.fromEntries(members.map((m, i) => [m.id, holes.map((h, k) => (k === i % 18 ? h.par - 1 : h.par))]));

describe('side games', () => {
  it('nothing on, nothing to compute', () => {
    expect(computeSideGames({ event: event(null), members, scores: fullScores })).toBe(null);
    expect(anySideGames(normalizeSideGames({ skins: { on: false } }))).toBe(false);
  });

  it('24 players: skins pot, Stableford and stroke net to zero and settle exactly', () => {
    const r = computeSideGames({
      event: event({ skins: { on: true, mode: 'pot', buyIn: 20, net: false }, stableford: { on: true, stake: 1 }, stroke: { on: true, stake: 5 } }),
      members,
      scores: fullScores,
    });
    expect(r.players).toHaveLength(24);
    expect(r.games.map((g) => g.game.type)).toEqual(['skins', 'stroke', 'stableford']);
    expect(Object.values(r.totals).reduce((a, b) => a + b, 0)).toBe(0);
    for (const g of r.games) expect(Object.values(g.balances).reduce((a, b) => a + b, 0)).toBe(0);
    // Gross skins pot: $20 x 24 = $480 in play, everyone paid in.
    const skins = r.games.find((g) => g.game.type === 'skins');
    expect(skins.game).toMatchObject({ mode: 'pot', buyIn: 2000 });
    const paid = Object.fromEntries(r.players.map((p) => [p.id, 0]));
    for (const p of r.payments) {
      paid[p.from] -= p.cents;
      paid[p.to] += p.cents;
    }
    expect(paid).toEqual(r.totals);
  });

  it('only the players who are in', () => {
    const sg = normalizeSideGames({ skins: { on: true, mode: 'perSkin', stake: 2 }, players: ['m0', 'm1', 'm2'] });
    expect(sideGamePlayers(sg, members).map((m) => m.id)).toEqual(['m0', 'm1', 'm2']);
    const r = computeSideGames({ event: event(sg), members, scores: fullScores });
    expect(Object.keys(r.totals)).toEqual(['m0', 'm1', 'm2']);
    expect(computeSideGames({ event: event({ ...sg, players: ['m0'] }), members, scores: fullScores })).toBe(null);
  });

  it('holes count once everyone in has finished them', () => {
    const partial = { ...fullScores, m5: holes.map((h, k) => (k < 9 ? h.par : null)) };
    const r = computeSideGames({ event: event({ skins: { on: true, mode: 'perSkin', stake: 1, net: false } }), members, scores: partial });
    expect(Object.values(r.totals).reduce((a, b) => a + b, 0)).toBe(0);
    expect(r.holesComplete).toBe(9);
  });
});
