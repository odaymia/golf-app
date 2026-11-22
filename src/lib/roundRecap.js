// Round recap facts: a small, plain summary of how everyone played, sent to
// the AI recap (supabase/functions/round-recap). Pure: no React, network or
// storage. Money arrives in integer cents and leaves as whole dollars text.

const RESULT = (d) =>
  d <= -3 ? 'albatross' : d === -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : d === 2 ? 'double' : 'triple+';

// One player's card -> stats. card: gross per hole (null = not played),
// strokes: handicap strokes per hole (optional).
export function playerStats(holes, card, strokes = []) {
  const s = { gross: 0, par: 0, net: 0, played: 0, counts: {}, best: null, worst: null, front: 0, back: 0, frontPar: 0, backPar: 0 };
  holes.forEach((h, i) => {
    const g = card[i];
    if (g == null) return;
    const d = g - h.par;
    s.gross += g;
    s.par += h.par;
    s.net += g - (strokes[i] ?? 0);
    s.played += 1;
    const r = RESULT(d);
    s.counts[r] = (s.counts[r] ?? 0) + 1;
    if (g === 1) s.counts.ace = (s.counts.ace ?? 0) + 1;
    const hole = { hole: i + 1, par: h.par, score: g, toPar: d };
    if (!s.best || d < s.best.toPar) s.best = hole;
    if (!s.worst || d > s.worst.toPar) s.worst = hole;
    if (i < 9) (s.front += g), (s.frontPar += h.par);
    else (s.back += g), (s.backPar += h.par);
  });
  return s;
}

const toParText = (n) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);
const dollars = (cents) => {
  const d = Math.round(Math.abs(cents) / 100);
  return cents === 0 ? '$0' : `${cents > 0 ? '+' : '-'}$${d}`;
};

// players: [{ name, card, strokes?, moneyCents? }]. Returns the facts object
// the recap function reads, best round first (net when handicaps are used).
export function recapFacts({ course, holes, players, net = false, games = [], matches = [], payments = [] }) {
  const rows = players.map((p) => {
    const st = playerStats(holes, p.card, p.strokes);
    const row = {
      name: p.name,
      holesPlayed: st.played,
      gross: st.played ? st.gross : null,
      toPar: st.played ? toParText(st.gross - st.par) : null,
      net: net && st.played ? st.net : undefined,
      netToPar: net && st.played ? toParText(st.net - st.par) : undefined,
      results: st.counts,
      bestHole: st.best && st.best.toPar < 0 ? st.best : undefined,
      worstHole: st.worst && st.worst.toPar >= 2 ? st.worst : undefined,
      frontNine: st.frontPar && holes.length > 9 ? toParText(st.front - st.frontPar) : undefined,
      backNine: st.backPar ? toParText(st.back - st.backPar) : undefined,
    };
    if (p.moneyCents != null) row.money = dollars(p.moneyCents);
    row._rank = st.played ? (net ? st.net - st.par : st.gross - st.par) : Infinity;
    return row;
  });
  rows.sort((a, b) => a._rank - b._rank);
  for (const r of rows) delete r._rank;
  return {
    course: course || 'the course',
    holes: holes.length,
    par: holes.reduce((t, h) => t + h.par, 0),
    scoring: net ? 'net (handicaps applied)' : 'gross',
    players: rows,
    ...(games.length ? { games } : {}),
    ...(matches.length ? { matches } : {}),
    ...(payments.length ? { payments } : {}),
  };
}

// A casual round + computeRound() result -> facts.
export function casualRecapFacts(round, computed, gameTitle) {
  const names = Object.fromEntries(round.players.map((p) => [p.id, p.name]));
  const hasMoney = computed.games.length > 0;
  return recapFacts({
    course: round.course.name,
    holes: round.course.holes,
    net: Object.values(computed.playing ?? {}).some((v) => v !== 0),
    players: round.players.map((p) => ({
      name: p.name,
      card: round.scores[p.id] ?? [],
      strokes: computed.strokes?.[p.id] ?? [],
      moneyCents: hasMoney ? computed.totals[p.id] ?? 0 : null,
    })),
    games: computed.games.map((g) => gameTitle(g.game)),
    payments: computed.payments.map((x) => `${names[x.from]} pays ${names[x.to]} $${Math.round(x.cents / 100)}`),
  });
}

// Course ratings: only courses everyone shares an id for (OpenGolfAPI
// "oga-<id>" and built-in "sc-…"); hand-typed courses have phone-only ids.
export const rateableKey = (key) => (typeof key === 'string' && /^(oga|sc)-/.test(key) ? key : null);

export const RATING_CATEGORIES = [
  { key: 'conditions', label: 'Conditions', hint: 'Greens, fairways, bunkers' },
  { key: 'layout', label: 'Layout', hint: 'Fun, variety, scenery' },
  { key: 'price', label: 'Price', hint: '5 = great value' },
  { key: 'difficulty', label: 'Difficulty', hint: '5 = really tough' },
];

// Overall stars = conditions, layout and price (difficulty isn't good or bad).
export function overallStars(r) {
  if (!r) return null;
  const v = [r.conditions, r.layout, r.price].map(Number).filter((x) => x > 0);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}
