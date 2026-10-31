import { describe, it, expect } from 'vitest';
import { scoreNassau, segmentForHole } from './nassau.js';
import { makeCtx, matchCard, parCard, sum } from './test-helpers.js';

const FLAT = { front: 500, back: 500, overall: 500 };
const HALVED9 = '=========';

function play(seq, opts = {}) {
  const ctx = makeCtx(['a', 'b'], matchCard(seq));
  return scoreNassau(ctx, {
    net: false,
    stakes: FLAT,
    autoPress: 0,
    pressOverall: false,
    matchups: [[['a'], ['b']]],
    presses: [],
    ...opts,
  });
}

const seg = (r, key) => r.matchups[0].segments.find((s) => s.key === key);

describe('nassau without presses', () => {
  it('front, back and overall are separate bets with their own stakes', () => {
    const r = play('a========' + 'b========', { stakes: { front: 500, back: 700, overall: 1000 } });
    expect(seg(r, 'front').bets[0].status.up).toBe(1);
    expect(seg(r, 'back').bets[0].status.up).toBe(-1);
    expect(seg(r, 'overall').bets[0].status.winner).toBe(null);
    expect(r.balances).toEqual({ a: -200, b: 200 });
  });

  it('sweeping all three', () => {
    const r = play('a========' + 'a========');
    expect(r.balances).toEqual({ a: 1500, b: -1500 });
  });

  it('all square everywhere pays nothing', () => {
    const r = play(HALVED9 + HALVED9);
    expect(r.balances).toEqual({ a: 0, b: 0 });
    expect(seg(r, 'front').bets[0].text).toBe('Halved');
  });

  it('mid-round shows where the money would be and how far it got', () => {
    const r = play('aa=b');
    expect(seg(r, 'front').thru).toBe(4);
    expect(seg(r, 'front').complete).toBe(false);
    expect(seg(r, 'back').thru).toBe(0);
    expect(r.balances).toEqual({ a: 1000, b: -1000 }); // front + overall, each 1 up
  });
});

describe('auto press at 2 down', () => {
  it('starts a press on the next hole', () => {
    const r = play('aa=======' + HALVED9, { autoPress: 2 });
    const bets = seg(r, 'front').bets;
    expect(bets).toHaveLength(2);
    expect(bets[1]).toMatchObject({ hole: 3, auto: true });
    expect(bets[0].status.up).toBe(2);
    expect(bets[1].status.up).toBe(0);
    // front orig + overall (overall is not auto-pressed by default)
    expect(seg(r, 'overall').bets).toHaveLength(1);
    expect(r.balances).toEqual({ a: 1000, b: -1000 });
  });

  it('presses cascade when the press itself goes 2 down', () => {
    const r = play('aaaa=====' + HALVED9, { autoPress: 2 });
    const bets = seg(r, 'front').bets;
    expect(bets.map((b) => b.hole)).toEqual([1, 3, 5]);
    expect(bets.map((b) => b.status.up)).toEqual([4, 2, 0]);
    expect(r.balances).toEqual({ a: 1500, b: -1500 });
  });

  it('a comeback wins the presses', () => {
    // a wins 1-2, b wins 3-5
    const r = play('aabbb====' + HALVED9, { autoPress: 2 });
    const bets = seg(r, 'front').bets;
    expect(bets.map((b) => b.hole)).toEqual([1, 3, 5]);
    expect(bets.map((b) => b.status.up)).toEqual([-1, -3, -1]);
    // front: b wins 3 bets; overall b 1 up
    expect(r.balances).toEqual({ a: -2000, b: 2000 });
  });

  it('no press when going 2 down on the last hole of a nine', () => {
    const r = play('=======aa' + HALVED9, { autoPress: 2 });
    expect(seg(r, 'front').bets).toHaveLength(1);
    expect(seg(r, 'back').bets).toHaveLength(1);
    expect(seg(r, 'overall').bets).toHaveLength(1);
    expect(r.balances).toEqual({ a: 1000, b: -1000 });
  });

  it('auto-presses the overall too when turned on', () => {
    const r = play('=======aa' + HALVED9, { autoPress: 2, pressOverall: true });
    const overall = seg(r, 'overall').bets;
    expect(overall.map((b) => b.hole)).toEqual([1, 10]);
    expect(r.balances).toEqual({ a: 1000, b: -1000 });
  });

  it('a press on 18 after going 2 down on 17', () => {
    const r = play(HALVED9 + '======bba', { autoPress: 2 });
    const back = seg(r, 'back').bets;
    expect(back.map((b) => b.hole)).toEqual([10, 18]);
    expect(back.map((b) => b.status.up)).toEqual([-1, 1]);
    // back: b wins original, a wins press -> 0. overall: b 1 up.
    expect(r.balances).toEqual({ a: -500, b: 500 });
  });

  it('3-down auto press waits for 3 down', () => {
    const r = play('aab======' + HALVED9, { autoPress: 3 });
    expect(seg(r, 'front').bets).toHaveLength(1);
    const r2 = play('aaa======' + HALVED9, { autoPress: 3 });
    expect(seg(r2, 'front').bets.map((b) => b.hole)).toEqual([1, 4]);
  });
});

describe('manual presses', () => {
  it('a press from hole 5 is its own bet', () => {
    const r = play('b===a====' + HALVED9, {
      presses: [{ matchup: 0, segment: 'front', hole: 5 }],
    });
    const bets = seg(r, 'front').bets;
    expect(bets.map((b) => [b.hole, b.manual, b.status.up])).toEqual([
      [1, false, 0],
      [5, true, 1],
    ]);
    expect(r.balances).toEqual({ a: 500, b: -500 });
  });

  it('presses outside their nine are ignored', () => {
    const r = play('a========' + HALVED9, {
      presses: [
        { matchup: 0, segment: 'front', hole: 12 },
        { matchup: 0, segment: 'front', hole: 1 },
        { matchup: 0, segment: 'back', hole: 3 },
      ],
    });
    expect(seg(r, 'front').bets).toHaveLength(1);
    expect(seg(r, 'back').bets).toHaveLength(1);
  });

  it('manual press on the overall runs to 18', () => {
    const r = play(HALVED9 + 'b=======a', {
      presses: [{ matchup: 0, segment: 'overall', hole: 11 }],
    });
    const overall = seg(r, 'overall').bets;
    expect(overall.map((b) => [b.hole, b.status.up])).toEqual([
      [1, 0],
      [11, 1],
    ]);
    // back halved, overall halved, overall press a +1
    expect(r.balances).toEqual({ a: 500, b: -500 });
  });

  it('manual and auto presses together', () => {
    const r = play('bb=a=a===' + HALVED9, {
      autoPress: 2,
      presses: [{ matchup: 0, segment: 'front', hole: 4 }],
    });
    // after 2: b 2 up -> auto press at 3. manual press at 4. After 6 the
    // manual press (now the latest bet) is 2 up -> auto press at 7.
    const bets = seg(r, 'front').bets;
    expect(bets.map((b) => b.hole)).toEqual([1, 3, 4, 7]);
    expect(bets.map((b) => b.status.up)).toEqual([0, 2, 2, 0]);
    expect(r.balances).toEqual({ a: 1000, b: -1000 });
  });

  it('presses are per matchup', () => {
    const ids = ['a', 'b', 'c'];
    const ctx = makeCtx(ids, parCard(ids, { a: { 2: 3 } }));
    const r = scoreNassau(ctx, {
      net: false,
      stakes: FLAT,
      autoPress: 0,
      matchups: [
        [['a'], ['b']],
        [['a'], ['c']],
      ],
      presses: [{ matchup: 1, segment: 'front', hole: 2 }],
    });
    expect(r.matchups[0].segments[0].bets).toHaveLength(1);
    expect(r.matchups[1].segments[0].bets).toHaveLength(2);
    // a beats b: front + overall. a beats c: front + press + overall.
    expect(r.balances).toEqual({ a: 2500, b: -1000, c: -1500 });
  });
});

describe('teams and net', () => {
  it('2v2 best ball pays each player', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const ctx = makeCtx(ids, parCard(ids, { b: { 1: 3 }, c: { 18: 3 }, d: { 12: 2 } }));
    const r = scoreNassau(ctx, {
      net: false,
      stakes: { front: 200, back: 300, overall: 500 },
      autoPress: 2,
      matchups: [[['a', 'b'], ['c', 'd']]],
    });
    // front ab 1 up; back cd 2 up (no press: 2 down only reached on 18); overall cd 1 up
    expect(r.balances).toEqual({ a: -600, b: -600, c: 600, d: 600 });
    expect(sum(r.balances)).toBe(0);
  });

  it('net nassau uses strokes', () => {
    const strokes = { a: Array(18).fill(0), b: Array(18).fill(0) };
    strokes.b[0] = 1;
    const ctx = makeCtx(['a', 'b'], parCard(['a', 'b'], { b: { 1: 4 } }), strokes);
    const game = { stakes: FLAT, autoPress: 0, matchups: [[['a'], ['b']]] };
    expect(scoreNassau(ctx, { ...game, net: false }).balances).toEqual({ a: 0, b: 0 });
    expect(scoreNassau(ctx, { ...game, net: true }).balances).toEqual({ a: -1000, b: 1000 });
  });
});

describe('segmentForHole', () => {
  it('maps holes to nines', () => {
    expect(segmentForHole(1)).toBe('front');
    expect(segmentForHole(9)).toBe('front');
    expect(segmentForHole(10)).toBe('back');
  });
});
