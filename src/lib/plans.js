// Plan limits (docs/pricing.md). Pure, tested. Off until payments go live:
// with PLANS_LIVE false every check passes, so nobody is blocked with no
// way to pay. Flip it (and add the server-side checks in the doc) together
// with Stripe checkout.

export const PLANS_LIVE = false;

export const LIMITS = {
  casualPlayers: 4, // free casual rounds: one foursome
  tournamentDays: 7, // every round within 7 days of the first
  leagueRounds: 15, // played rounds per league season (+ add-ons)
  leagueMonths: 12, // season length from creation
};

const DAY = 86400000;
const dayNum = (iso) => Math.round(Date.parse(`${iso}T12:00:00Z`) / DAY);

// Most players a casual round allows (24 while plans are off).
export const casualMaxPlayers = (fallback, live = PLANS_LIVE) => (live ? LIMITS.casualPlayers : fallback);

// Adding a round on `date` to a tournament whose rounds are on `dates`:
// a message if it breaks the 7-day window, else null.
export function tournamentDateProblem(dates, date, live = PLANS_LIVE) {
  if (!live || !date) return null;
  const all = [...dates.filter(Boolean), date].map(dayNum);
  const span = Math.max(...all) - Math.min(...all);
  return span > LIMITS.tournamentDays - 1
    ? `A tournament’s rounds must all be within ${LIMITS.tournamentDays} days of the first round. For a longer season, create a league.`
    : null;
}

// League rounds that count: ones with a score or marked final.
export function playedRounds(events, scores = {}) {
  return events.filter(
    (e) => e.status === 'final' || Object.values(scores[e.id] ?? {}).some((card) => (card ?? []).some((g) => g != null)),
  ).length;
}

// Adding a league round: a message if the season is used up, else null.
// extraRounds: add-on rounds bought; createdAt: the league's ISO timestamp.
export function leagueRoundProblem({ events, scores, createdAt, extraRounds = 0, now = Date.now() }, live = PLANS_LIVE) {
  if (!live) return null;
  if (createdAt) {
    const end = new Date(createdAt);
    end.setMonth(end.getMonth() + LIMITS.leagueMonths);
    if (now > end.getTime()) return `This league’s ${LIMITS.leagueMonths}-month season is over. Start a new season to keep playing.`;
  }
  const cap = LIMITS.leagueRounds + extraRounds;
  if (playedRounds(events, scores) >= cap) return `This season’s ${cap} rounds are used. Add more rounds to keep going.`;
  return null;
}

// One check for any "add a round" screen.
export function addRoundProblem(data, date, live = PLANS_LIVE) {
  const kind = data.league.settings?.kind ?? 'league';
  if (kind === 'tournament') return tournamentDateProblem(data.events.map((e) => e.date), date, live);
  return leagueRoundProblem({ events: data.events, scores: data.scores, createdAt: data.league.createdAt, extraRounds: data.league.settings?.extraRounds ?? 0 }, live);
}
