# Pricing plan (revised Nov 27, 2026, not live yet)

The app is free to download and use. Everyone who plays needs a Scribble
account (members only). Organizers pay; players never do. Prices scale with
field size, so big events pay more and small groups can try everything free.

| What | Price | Limits |
|---|---|---|
| Casual round | Free | Up to **8 players** (two foursomes). |
| Crew | **$49 / year** | A regular group's recurring game: unlimited players, a running money tally across the season, group standings. **Not built yet.** |
| Tournament | **Free** up to 8 players · **$19.99** up to 40 · **$49** up to 144 | Each organizer's **first tournament is free** at any size up to 144. Every round must fall within **7 days** of the first round. Over 144: club plan. |
| League | **$99** up to 16 players · **$199** up to 60 · **$349** for 61+ | Per season: **15 played rounds or 12 months**, whichever comes first. Extra rounds sold as add-ons ($10 each or $49 for 10). |
| Club | **$999 / year** (**$499** founding price for the first 50 clubs) | Every league and tournament at the venue, any size, plus branding and staff accounts. Must stay above the price of the leagues it replaces. |

The old $9.99/month unlimited-tournaments plan is dropped: it overlapped
leagues and the club plan.

Why these numbers: a league fee spread over its players is about $5 each, easy
to add to dues. The club plan is still about a quarter of Golf Genius
(~$4,200/year per club). Treat the first season as the test and adjust.

## Counting rules
- Field size = players in the league/tournament (not watchers or organizers
  who aren't playing).
- A league round counts once it has a score or is marked final. Deleted or
  rained-out rounds with no scores don't use one up.
- League clock: 12 months from the league's creation.
- Tournament window: first round date through first + 6 days.
- Existing leagues/tournaments created before limits go live are grandfathered.

## How it's built
- All limits and prices (integer cents) live in `src/lib/plans.js` (tested)
  behind `PLANS_LIVE = false`: `LIMITS`, `TOURNAMENT_TIERS`, `LEAGUE_TIERS`,
  `PRICES`, `tierFor(kind, players)`, `fieldSizeProblem(...)`. Flip
  `PLANS_LIVE` to true only when payments work, so nobody is blocked with no
  way to pay.
- The app checks: casual Setup player count; adding league/tournament rounds
  (phone Add round, desktop Schedule, Ryder Cup Rounds step).
- Not wired yet: `fieldSizeProblem` (adding players past the paid tier) and
  Crew. Field size must be checked where players are added (Add members,
  roster import, email invites, and `join_league` on the server), with the
  paid tier read from the `purchases` table below.
- Before going live, also enforce server-side (a database check on
  `league_events` insert and on new players, and what each league has paid
  for in a `purchases` table written only by the Stripe webhook), since
  anything in the app can be bypassed.

## Payments
- Sell organizer plans on the website (Stripe checkout, same setup as
  instructors, docs/instructors.md) to avoid the 15–30% store fee.
- Store apps: Apple/Google generally require in-app purchase for digital
  goods; US rules changed in 2025 to allow linking out to web checkout.
  Check the current rules when submitting.
- Turn pricing on in January, when spring leagues sign up, with founding
  prices for early organizers.
- Wording: "side games", never "bet"/"wager" (App Store).
