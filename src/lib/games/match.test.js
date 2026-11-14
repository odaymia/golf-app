import { describe, it, expect } from 'vitest';
import { holeResults, matchStatus, describeMatch, scoreMatchPlay, matchSummary } from './match.js';
import { makeCtx, matchCard, parCard, sum } from './test-helpers.js';

const status = (seq) => {
  const ctx = makeCtx(['a', 'b'], matchCard(seq));
  return matchStatus(holeResults(ctx, ['a'], ['b'], false), 0, 17);
};

describe('match play status', () => {
  it('counts holes won', () => {
    const s = status('aab');
    expect(s).toMatchObject({ up: 1, played: 3, remaining: 15, complete: false, winner: 0 });
    expect(describeMatch(s)).toBe('1 UP thru 3');
  });

  it('all square and halved', () => {
    expect(describeMatch(status('ab'))).toBe('All square thru 2');
    const s = status('ab================');
    expect(s.complete).toBe(true);
    expect(s.winner).toBe(null);
    expect(describeMatch(s)).toBe('Halved');
  });

  it('closes out early: 3 & 2', () => {
    const s = status('aaa=============');
    expect(s).toMatchObject({ up: 3, played: 16, remaining: 2, closedOut: true, complete: true });
    expect(describeMatch(s)).toBe('3 & 2');
  });

  it('can stop counting once the match is decided', () => {
    // a wins holes 1-7, then everything is halved and b wins 18.
    const ctx = makeCtx(['a', 'b'], matchCard('aaaaaaa==========b'));
    const results = holeResults(ctx, ['a'], ['b'], false);
    expect(matchStatus(results, 0, 17).up).toBe(6);
    // 7 up with 6 to play after hole 12: the match is over.
    const early = matchStatus(results, 0, 17, { stopAtCloseout: true });
    expect(early).toMatchObject({ up: 7, played: 12, remaining: 6, closedOut: true, complete: true });
    expect(describeMatch(early)).toBe('7 & 6');
  });

  it('dormie', () => {
    expect(describeMatch(status('bb==============='.slice(0, 16)))).toBe('2 DN (dormie)');
  });

  it('final result on 18', () => {
    expect(describeMatch(status('b=================='.slice(0, 18)))).toBe('1 DN (final)');
  });

  it('stops counting at the first unscored hole', () => {
    const ctx = makeCtx(['a', 'b'], matchCard('aaaa'));
    ctx.gross.a[1] = null; // hole 2 missing
    const s = matchStatus(holeResults(ctx, ['a'], ['b'], false), 0, 17);
    expect(s.played).toBe(1);
    expect(s.up).toBe(1);
  });

  it('not started', () => {
    expect(describeMatch(status(''))).toBe('Not started');
  });
});

describe('net and best ball', () => {
  it('a handicap stroke turns a loss into a halve', () => {
    // hole 1: a par 4, b bogey 5 with a stroke = net 4
    const strokes = { a: Array(18).fill(0), b: Array(18).fill(0) };
    strokes.b[0] = 1;
    const ctx = makeCtx(['a', 'b'], parCard(['a', 'b'], { b: { 1: 5 } }, 1), strokes);
    expect(holeResults(ctx, ['a'], ['b'], false)[0]).toBe(1);
    expect(holeResults(ctx, ['a'], ['b'], true)[0]).toBe(0);
  });

  it('team plays its best ball', () => {
    const ctx = makeCtx(['a', 'b', 'c', 'd'], parCard(['a', 'b', 'c', 'd'], { a: { 1: 7 }, b: { 1: 3 } }, 1));
    expect(holeResults(ctx, ['a', 'b'], ['c', 'd'], false)[0]).toBe(1);
  });

  it('waits until every team member has a score', () => {
    const ctx = makeCtx(['a', 'b', 'c', 'd'], parCard(['a', 'b', 'c', 'd'], {}, 1));
    ctx.gross.b[0] = null;
    expect(holeResults(ctx, ['a', 'b'], ['c', 'd'], false)[0]).toBe(null);
  });
});

describe('scoreMatchPlay money', () => {
  it('1v1 winner collects the stake', () => {
    const ctx = makeCtx(['a', 'b'], matchCard('a================='));
    const r = scoreMatchPlay(ctx, { net: false, stake: 1000, matchups: [[['a'], ['b']]] });
    expect(r.balances).toEqual({ a: 1000, b: -1000 });
    expect(r.matchups[0].text).toBe('1 UP (final)');
  });

  it('halved match pays nothing', () => {
    const ctx = makeCtx(['a', 'b'], matchCard('ab'));
    const r = scoreMatchPlay(ctx, { net: false, stake: 1000, matchups: [[['a'], ['b']]] });
    expect(r.balances).toEqual({ a: 0, b: 0 });
  });

  it('2v2 pays each player', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const ctx = makeCtx(ids, parCard(ids, { c: { 4: 4 } }));
    const r = scoreMatchPlay(ctx, { net: false, stake: 500, matchups: [[['a', 'b'], ['c', 'd']]] });
    expect(r.balances).toEqual({ a: -500, b: -500, c: 500, d: 500 });
  });

  it('round robin of 3 players stays zero-sum', () => {
    const ids = ['a', 'b', 'c'];
    const ctx = makeCtx(ids, parCard(ids, { a: { 1: 3 }, b: { 2: 3 } }));
    const r = scoreMatchPlay(ctx, {
      net: false,
      stake: 200,
      matchups: [
        [['a'], ['b']],
        [['a'], ['c']],
        [['b'], ['c']],
      ],
    });
    // a halves b, beats c; b beats c
    expect(r.balances).toEqual({ a: 200, b: 200, c: -400 });
    expect(sum(r.balances)).toBe(0);
  });
});

describe('matchSummary (live scoreboard)', () => {
  const sum = (seq, opts) => matchSummary(status(seq, opts));
  it('not started and all square', () => {
    expect(sum('')).toEqual({ leader: null, big: 'ALL SQUARE', small: 'not started' });
    expect(sum('ab')).toEqual({ leader: null, big: 'ALL SQUARE', small: 'thru 2' });
  });
  it('leader and margin', () => {
    expect(sum('aaa')).toEqual({ leader: 0, big: '3 UP', small: 'thru 3' });
    expect(sum('bb=')).toEqual({ leader: 1, big: '2 UP', small: 'thru 3' });
  });
  it('dormie, closeout, final', () => {
    expect(sum('bb'.padEnd(16, '='))).toEqual({ leader: 1, big: '2 UP', small: 'dormie · thru 16' });
    expect(matchSummary(matchStatus(holeResults(makeCtx(['a', 'b'], matchCard('aaaa'.padEnd(18, '='))), ['a'], ['b'], false), 0, 17, { stopAtCloseout: true })))
      .toEqual({ leader: 0, big: '4 & 3', small: 'final' });
    expect(sum('a'.padEnd(18, '='))).toEqual({ leader: 0, big: '1 UP', small: 'final' });
    expect(sum('ab'.padEnd(18, '='))).toEqual({ leader: null, big: 'HALVED', small: 'final' });
  });
  it('casual match play reports per-hole results and stops at the closeout', () => {
    const ctx = makeCtx(['a', 'b'], matchCard('aaaa'.padEnd(18, '=')));
    const r = scoreMatchPlay(ctx, { net: false, stake: 100, matchups: [[['a'], ['b']]] });
    expect(r.matchups[0].results.slice(0, 5)).toEqual([1, 1, 1, 1, 0]);
    expect(r.matchups[0].text).toBe('4 & 3');
    expect(r.balances).toEqual({ a: 100, b: -100 });
  });
});
