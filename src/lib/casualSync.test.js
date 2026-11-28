import { describe, expect, it } from 'vitest';
import {
  applyEntries,
  canScore,
  defaultGroups,
  diffEntries,
  firstOpenHole,
  groupProblems,
  mergeServer,
  myGroupIds,
  roundFromServer,
  roundGroups,
  seedKnown,
  setupOf,
  toEntries,
} from './casualSync.js';
import { newRound, defaultSettings } from './roundSetup.js';
import { computeRound } from './games/round.js';

const holes = Array.from({ length: 18 }, (_, i) => ({ par: 4, hcp: i + 1 }));
const course = { id: 'c1', name: 'Test Course', holes };
const tee = { name: 'Blue', rating: 72, slope: 113 };

function makeRound(n = 4, opts = {}) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, index: 0, userId: `u${i + 1}` }));
  const settings = defaultSettings();
  if (opts.skins) settings.skins = { ...settings.skins, on: true };
  const r = newRound({ course, tee, players, settings, groups: opts.groups });
  return { ...r, shared: true, ownerId: 'u1' };
}

// A phone: its round + what it knows; edit, then send/receive through a fake server.
function phone(round) {
  return { round, known: {} };
}
function edit(ph, fn, now) {
  ph.round = fn(structuredClone(ph.round));
  const { known, changes } = diffEntries(ph.known, ph.round, now);
  ph.known = known;
  return changes;
}
function server() {
  const rows = {};
  return {
    rows,
    put(changes) {
      for (const c of changes) if (!rows[c.key] || rows[c.key].at < c.at) rows[c.key] = { ...c };
    },
    list: () => Object.values(rows),
  };
}
function receive(ph, srv) {
  const { known, changed } = mergeServer(ph.known, srv.list());
  ph.known = known;
  ph.round = applyEntries(ph.round, changed);
}

describe('foursomes', () => {
  it('splits players evenly, bigger groups first', () => {
    const ids = (n) => Array.from({ length: n }, (_, i) => i);
    expect(defaultGroups(ids(4)).map((g) => g.length)).toEqual([4]);
    expect(defaultGroups(ids(5)).map((g) => g.length)).toEqual([3, 2]);
    expect(defaultGroups(ids(8)).map((g) => g.length)).toEqual([4, 4]);
    expect(defaultGroups(ids(9)).map((g) => g.length)).toEqual([3, 3, 3]);
    expect(defaultGroups(ids(10)).map((g) => g.length)).toEqual([4, 3, 3]);
    expect(defaultGroups(ids(1))).toEqual([[0]]);
  });

  it('each player scores only their own foursome', () => {
    const r = makeRound(8, { groups: [['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8']] });
    expect(myGroupIds(r, 'u2')).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(canScore(r, 'u6', 'p8')).toBe(true);
    expect(canScore(r, 'u6', 'p1')).toBe(false);
    expect(myGroupIds(r, 'stranger')).toEqual([]);
  });

  it('old (unshared) rounds score everyone; players missing from groups get their own group', () => {
    const r = { ...makeRound(4), shared: false };
    expect(myGroupIds(r, 'anyone')).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(roundGroups({ ...r, groups: [['p1', 'p2']] })).toEqual([['p1', 'p2'], ['p3', 'p4']]);
  });

  it('flags a group over 4', () => {
    expect(groupProblems([[1, 2, 3, 4, 5]], { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' })[0]).toMatch(/Group 1 has 5/);
    expect(groupProblems([[1, 2, 3, 4], [5]])).toEqual([]);
  });
});

describe('entries', () => {
  it('round -> entries -> round round-trips scores, Wolf picks, presses, status and recaps', () => {
    const r = makeRound(4);
    r.scores.p1[0] = 4;
    r.scores.p3[17] = 7;
    r.games.push({ id: 'w', type: 'wolf', decisions: { 3: { partner: 'p2' } } });
    r.games.push({ id: 'n', type: 'nassau', presses: [{ matchup: 0, segment: 'back', hole: 12 }] });
    r.status = 'final';
    r.recap = { text: 'Great day' };
    r.playerRecaps = { P1: 'You did fine' };
    const e = toEntries(r);
    expect(e['s:p1:1']).toBe(4);
    expect(e['s:p3:18']).toBe(7);
    expect(e['w:w:3']).toEqual({ partner: 'p2' });
    expect(e['p:n:0:back:12']).toBe(true);
    expect(e.status).toBe('final');

    const blank = setupOf(r);
    expect(blank.scores).toBeUndefined();
    expect(blank.games.find((g) => g.id === 'w').decisions).toEqual({});
    const { round } = roundFromServer(
      { id: r.id, owner_id: 'u1', setup: blank, created_at: '2026-11-27T10:00:00Z' },
      Object.entries(e).map(([key, value]) => ({ key, value, at: 5 })),
    );
    expect(round.scores.p1[0]).toBe(4);
    expect(round.scores.p3[17]).toBe(7);
    expect(round.games.find((g) => g.id === 'w').decisions[3]).toEqual({ partner: 'p2' });
    expect(round.games.find((g) => g.id === 'n').presses).toEqual([{ matchup: 0, segment: 'back', hole: 12 }]);
    expect(round.status).toBe('final');
    expect(round.recap).toEqual({ text: 'Great day' });
    expect(round.playerRecaps.P1).toBe('You did fine');
  });

  it('only changed keys are sent, and blanks are not sent until they replace a score', () => {
    const ph = phone(makeRound(4));
    expect(edit(ph, (r) => r, 1)).toEqual([]);
    expect(edit(ph, (r) => ((r.scores.p1[0] = 5), r), 2)).toEqual([{ key: 's:p1:1', value: 5, at: 2 }]);
    expect(edit(ph, (r) => ((r.currentHole = 2), r), 3)).toEqual([]);
    expect(edit(ph, (r) => ((r.scores.p1[0] = null), r), 4)).toEqual([{ key: 's:p1:1', value: null, at: 4 }]);
  });

  it('never stamps a change older than one already known (phone clock behind)', () => {
    const ph = phone(makeRound(2));
    ph.known = { 's:p1:1': { v: 4, at: 1000 } };
    ph.round.scores.p1[0] = 4;
    const [c] = edit(ph, (r) => ((r.scores.p1[0] = 5), r), 10);
    expect(c.at).toBe(1001);
  });
});

describe('merging phones', () => {
  it('two foursomes scoring at once never wipe each other', () => {
    const groups = [['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8']];
    const start = makeRound(8, { groups });
    const a = phone(start);
    const b = phone(structuredClone(start));
    const srv = server();

    srv.put(edit(a, (r) => { for (const id of groups[0]) r.scores[id][0] = 4; return r; }, 100));
    srv.put(edit(b, (r) => { for (const id of groups[1]) r.scores[id][0] = 5; return r; }, 101));
    receive(a, srv);
    receive(b, srv);
    for (const ph of [a, b]) {
      expect(groups[0].map((id) => ph.round.scores[id][0])).toEqual([4, 4, 4, 4]);
      expect(groups[1].map((id) => ph.round.scores[id][0])).toEqual([5, 5, 5, 5]);
    }
    // Receiving doesn't make anything to send back.
    expect(diffEntries(a.known, a.round, 200).changes).toEqual([]);
  });

  it('the newest edit to the same score wins, whichever arrives first', () => {
    const start = makeRound(4);
    const a = phone(start);
    const b = phone(structuredClone(start));
    const srv = server();
    const fromA = edit(a, (r) => ((r.scores.p2[3] = 6), r), 100); // made first, sent late (offline)
    srv.put(edit(b, (r) => ((r.scores.p2[3] = 5), r), 200));
    receive(a, srv); // a's own queued edit is older: b's 5 wins on a too
    srv.put(fromA); // arrives late: ignored by the server
    receive(b, srv);
    expect(a.round.scores.p2[3]).toBe(5);
    expect(b.round.scores.p2[3]).toBe(5);
    expect(srv.rows['s:p2:4'].value).toBe(5);
  });

  it('a local edit newer than the server copy is kept until sent', () => {
    const ph = phone(makeRound(4));
    const srv = server();
    srv.put([{ key: 's:p1:1', value: 3, at: 50 }]);
    edit(ph, (r) => ((r.scores.p1[0] = 4), r), 100);
    receive(ph, srv);
    expect(ph.round.scores.p1[0]).toBe(4);
  });

  it('a cleared score stays cleared (an older copy cannot bring it back)', () => {
    const start = makeRound(2);
    const a = phone(start);
    const b = phone(structuredClone(start));
    const srv = server();
    srv.put(edit(a, (r) => ((r.scores.p1[0] = 9), r), 100));
    receive(b, srv);
    expect(b.round.scores.p1[0]).toBe(9);
    srv.put(edit(b, (r) => ((r.scores.p1[0] = null), r), 150));
    srv.put([{ key: 's:p1:1', value: 9, at: 100 }]); // a re-sends its old copy
    receive(a, srv);
    expect(a.round.scores.p1[0]).toBe(null);
  });

  it('presses and Wolf picks merge per hole', () => {
    const start = makeRound(4);
    start.games.push({ id: 'n', type: 'nassau', presses: [] });
    const a = phone(start);
    const b = phone(structuredClone(start));
    const srv = server();
    srv.put(edit(a, (r) => (r.games.find((g) => g.id === 'n').presses.push({ matchup: 0, segment: 'front', hole: 4 }), r), 10));
    srv.put(edit(b, (r) => (r.games.find((g) => g.id === 'n').presses.push({ matchup: 1, segment: 'front', hole: 6 }), r), 11));
    receive(a, srv);
    receive(b, srv);
    for (const ph of [a, b]) expect(ph.round.games.find((g) => g.id === 'n').presses).toHaveLength(2);
    // Taking a press back removes it everywhere.
    srv.put(edit(a, (r) => { const g = r.games.find((x) => x.id === 'n'); g.presses = g.presses.filter((p) => p.hole !== 4); return r; }, 20));
    receive(b, srv);
    expect(b.round.games.find((g) => g.id === 'n').presses).toEqual([{ matchup: 1, segment: 'front', hole: 6 }]);
  });

  it('a lost record seeded at time 0 loses to every real change', () => {
    const r = makeRound(2);
    r.scores.p1[0] = 7;
    const known = seedKnown(r);
    const { changed } = mergeServer(known, [{ key: 's:p1:1', value: 4, at: 1 }]);
    expect(changed).toEqual({ 's:p1:1': 4 });
  });

  it('side games across foursomes settle to zero from merged scores', () => {
    const groups = [['p1', 'p2', 'p3', 'p4'], ['p5', 'p6', 'p7', 'p8']];
    const start = makeRound(8, { groups, skins: true });
    const a = phone(start);
    const b = phone(structuredClone(start));
    const srv = server();
    srv.put(edit(a, (r) => { for (const id of groups[0]) r.scores[id].fill(4); r.scores.p1[0] = 3; return r; }, 1));
    srv.put(edit(b, (r) => { for (const id of groups[1]) r.scores[id].fill(4); return r; }, 2));
    receive(a, srv);
    receive(b, srv);
    const ca = computeRound(a.round);
    const cb = computeRound(b.round);
    expect(ca.finished).toBe(true);
    expect(ca.totals).toEqual(cb.totals);
    expect(Object.values(ca.totals).reduce((s, v) => s + v, 0)).toBe(0);
    expect(ca.totals.p1).toBeGreaterThan(0);
  });

  it('firstOpenHole finds where a foursome left off', () => {
    const r = makeRound(4);
    for (const id of ['p1', 'p2']) r.scores[id].fill(4, 0, 5);
    expect(firstOpenHole(r, ['p1', 'p2'])).toBe(6);
    expect(firstOpenHole(r, ['p1', 'p3'])).toBe(1);
  });
});
