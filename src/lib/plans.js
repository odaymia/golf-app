// Plan limits (docs/pricing.md). Pure, tested. Off until payments go live:
// with PLANS_LIVE false every check passes, so nobody is blocked with no
// way to pay. Flip it (and add the server-side checks in the doc) together
// with Stripe checkout.

export const PLANS_LIVE = false;

export const LIMITS = {
  casualPlayers: 8, // free casual rounds: two foursomes
  tournamentDays: 7, // every round within 7 days of the first
  leagueRounds: 15, // played rounds per league season (+ add-ons)
  leagueMonths: 12, // season length from creation
};

// Prices in integer cents. Field-size tiers: the cheapest tier whose
// maxPlayers covers the field (null = no cap). Tournaments free up to 8.
export const TOURNAMENT_TIERS = [
  { key: 'free', maxPlayers: 8, cents: 0 },
  { key: 'up40', maxPlayers: 40, cents: 1999 },
  { key: 'up144', maxPlayers: 144, cents: 4900 },
];
export const LEAGUE_TIERS = [
  { key: 'up16', maxPlayers: 16, cents: 9900 },
  { key: 'up60', maxPlayers: 60, cents: 19900 },
  { key: 'unlimited', maxPlayers: null, cents: 34900 },
];
export const PRICES = {
  crewYear: 4900, // a regular group's recurring game (Crew features not built yet)
  clubYear: 99900, // every league + tournament at a venue
  clubFoundingYear: 49900, // first 50 clubs
  leagueAddOnRound: 1000,
  leagueAddOnTen: 4900,
};

const tiersFor = (kind) => (kind === 'tournament' ? TOURNAMENT_TIERS : LEAGUE_TIERS);

// The tier a field of `players` needs, or null when it's bigger than any
// tier (a tournament over 144: club plan).
export function tierFor(kind, players) {
  return tiersFor(kind).find((t) => t.maxPlayers == null || players <= t.maxPlayers) ?? null;
}

// A message when `players` won't fit the tier paid for, else null.
// paidTier: the tier key bought (none = free; leagues have no free tier).
// firstFree: the organizer's first tournament, free at any size up to 144.
// club: the venue's club plan covers every size.
export function fieldSizeProblem({ kind = 'league', players, paidTier = null, firstFree = false, club = false }, live = PLANS_LIVE) {
  if (!live || club) return null;
  const need = tierFor(kind, players);
  if (!need) return `${players} players is more than any ${kind} plan covers. A club plan covers any size.`;
  if (kind === 'tournament' && firstFree) return null;
  const tiers = tiersFor(kind);
  const paid = tiers.find((t) => t.key === paidTier) ?? (kind === 'tournament' ? tiers[0] : null);
  if (paid && (paid.maxPlayers == null || players <= paid.maxPlayers)) return null;
  const price = `$${(need.cents / 100).toFixed(2)}`;
  if (paid?.cents === 0) return `Free ${kind}s are up to ${paid.maxPlayers} players. A ${kind} of ${players} players is ${price}.`;
  return paid
    ? `This ${kind} is paid for up to ${paid.maxPlayers} players. Upgrade to fit ${players} (${price}).`
    : `A ${kind} of ${players} players is ${price}.`;
}

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
