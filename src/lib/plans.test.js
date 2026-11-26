import { describe, it, expect } from 'vitest';
import { LIMITS, addRoundProblem, casualMaxPlayers, leagueRoundProblem, playedRounds, tournamentDateProblem } from './plans.js';

describe('plan limits', () => {
  it('are off until payments go live', () => {
    expect(casualMaxPlayers(24)).toBe(24);
    expect(tournamentDateProblem(['2026-01-01'], '2026-06-01')).toBe(null);
    expect(leagueRoundProblem({ events: Array(40).fill({ status: 'final' }) })).toBe(null);
  });

  it('casual rounds: 4 players when live', () => {
    expect(casualMaxPlayers(24, true)).toBe(LIMITS.casualPlayers);
  });

  it('tournaments: every round within 7 days of the first', () => {
    expect(tournamentDateProblem(['2026-12-01'], '2026-12-07', true)).toBe(null);
    expect(tournamentDateProblem(['2026-12-01'], '2026-12-08', true)).toMatch(/7 days/);
    expect(tournamentDateProblem(['2026-12-05'], '2026-11-29', true)).toBe(null); // earlier day, still within 7
    expect(tournamentDateProblem([null], '2026-12-08', true)).toBe(null);
  });

  it('leagues: only played rounds count', () => {
    const events = [{ id: 'a', status: 'final' }, { id: 'b', status: 'scheduled' }, { id: 'c', status: 'scheduled' }];
    expect(playedRounds(events, { b: { m1: [4, null] }, c: { m1: [null, null] } })).toBe(2);
  });

  it('leagues: 15 played rounds (+ add-ons) or 12 months', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}`, status: 'final' }));
    const now = Date.parse('2026-12-01T00:00:00Z');
    expect(leagueRoundProblem({ events: fifteen.slice(0, 14), createdAt: '2026-06-01T00:00:00Z', now }, true)).toBe(null);
    expect(leagueRoundProblem({ events: fifteen, createdAt: '2026-06-01T00:00:00Z', now }, true)).toMatch(/15 rounds/);
    expect(leagueRoundProblem({ events: fifteen, extraRounds: 10, createdAt: '2026-06-01T00:00:00Z', now }, true)).toBe(null);
    expect(leagueRoundProblem({ events: [], createdAt: '2025-11-01T00:00:00Z', now }, true)).toMatch(/season is over/);
  });

  it('one check for any add-a-round screen', () => {
    const tournament = { league: { settings: { kind: 'tournament' } }, events: [{ date: '2026-12-01' }], scores: {} };
    expect(addRoundProblem(tournament, '2026-12-10', true)).toMatch(/7 days/);
    const league = { league: { settings: {}, createdAt: new Date().toISOString() }, events: [], scores: {} };
    expect(addRoundProblem(league, '2027-01-01', true)).toBe(null);
  });
});
