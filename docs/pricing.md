# Pricing plan (decided Nov 2026, not live yet)

The app is free to download and use. Everyone who plays needs a Scribble
account (members only). Organizers pay; players never do.

| What | Price | Limits |
|---|---|---|
| Casual round | Free | Up to **4 players** (one foursome). Bigger groups use a tournament. |
| Tournament | **$19.99** each | Any number of players. Every round must fall within **7 days** of the first round. |
| League | **$199** per season | Any number of players. **15 played rounds or 12 months**, whichever comes first. Extra rounds sold as add-ons (e.g. $10 each or $49 for 10). |
| Club membership | **$299 / year** (consider $499–999 once it has branding, multiple admins, member directory) | Manage all club tournaments. |
| Monthly subscription | **$9.99 / month** (consider $14.99/mo or $99/yr) | Unlimited tournaments (each still 7 days). Leagues not included. |

## Counting rules
- A league round counts once it has a score or is marked final. Deleted or
  rained-out rounds with no scores don't use one up.
- League clock: 12 months from the league's creation.
- Tournament window: first round date through first + 6 days.
- Existing leagues/tournaments created before limits go live are grandfathered.

## How it's built
- All limits live in `src/lib/plans.js` (tested) behind `PLANS_LIVE = false`.
  Flip it to true only when payments work, so nobody is blocked with no way
  to pay.
- The app checks: casual Setup player count; adding league/tournament rounds
  (phone Add round, desktop Schedule, Ryder Cup Rounds step).
- Before going live, also enforce server-side (a database check on
  `league_events` insert, and what each league has paid for in a
  `purchases` table written only by the Stripe webhook), since anything in
  the app can be bypassed.

## Payments
- Website: Stripe checkout (same setup as instructors, docs/instructors.md).
- Store apps: Apple/Google generally require in-app purchase for digital
  goods (15–30% fee); US rules changed in 2025 to allow linking out to web
  checkout. Check the current rules when submitting.
- Wording: "side games", never "bet"/"wager" (App Store).
