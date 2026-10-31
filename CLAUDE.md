# Golf App (working name)

A golf app for leagues, daily tournaments, and foursomes playing betting games
on the course. Goal: everything Golf Genius does, but far easier to use. Ships
with a website (marketing page + public league/event pages).

Separate product from the shop apps (time clock, Shop Desk). Own repo, own
deploy, own Supabase project.

## Plan

1. Foursome MVP: pick course, add players, pick games, hole-by-hole scoring,
   live settle-up ("Mike owes Dave $14"). **Built (Phase 1).**
2. Leagues: season schedule, pairings, standings, points, league handicaps.
3. Tournaments: flights, shotgun/tee times, big leaderboard, side pots, payouts.
4. Business: club/organizer accounts, branding, paid tiers, App Store builds.

## Stack

Vite 5 + React 18 (plain JS, no router) as an offline-first PWA
(`vite-plugin-pwa`, service worker precaches the app). Data lives on the device
in IndexedDB. Supabase (auth, sync, realtime leaderboards) comes later;
Capacitor later for App Store / Play Store.

## Commands

```bash
npm run dev        # dev server (http://localhost:5173)
npm test           # Vitest, all engine + setup + storage tests
npm run test:watch
npm run lint       # ESLint 9 flat config
npm run build      # production build + service worker into dist/
npm run preview    # serve dist/
```

## Structure

```
src/
  lib/
    games/          Pure game/money engine. No React, DOM or storage.
      money.js      Integer-cents helpers: team bets, exact pot splits, formatting
      handicap.js   Course handicap (WHS), allowance %, off-the-low, strokes per hole
      scores.js     gross/net/best-ball lookups shared by every game
      match.js      Match play (1v1, 2v2 best ball, round robin) + status text
      stroke.js     Stroke play, per opponent or per stroke
      nassau.js     Front/back/overall, manual presses, auto-press at N down
      skins.js      Gross/net, carryovers, validation, per-skin or pot
      wolf.js       4-player rotation, partner / lone (2x) / blind (3x)
      vegas.js      Team numbers, double digits high-first, birdie flip
      settle.js     Fewest-payments settle-up (exact bitmask search)
      round.js      computeRound(round): strokes, every game, totals, payments
      *.test.js     Tests live next to each module; test-helpers.js builds cards
    roundSetup.js   Setup defaults, plain-English rules, settings -> engine configs
    storage.js      The only IndexedDB code (rounds + saved courses)
  components/       Home, Setup, Play (Score/Money/Card tabs), Settle, summaries
  App.jsx           Screen switching; saves the round on every change
```

### Engine conventions

- All money is integer cents. Every game returns `balances` `{playerId: cents}`
  that must sum to exactly zero; `computeRound` throws if one doesn't.
- Game configs live on the round (`round.games[]`), including in-round state
  (Nassau `presses`, Wolf `decisions`), so a round is one JSON document.
- Games score "as if the round ended now": results update hole by hole.
  Nassau and match status count holes in order and stop at the first gap.
- Plus handicaps are stored as negative indexes (+2.1 -> -2.1).
- Rule choices (document any change here and in the module header):
  - Nassau auto-press: a new press starts the hole after the latest bet in that
    nine goes N down, only if a hole is left in the nine. The 18-hole bet is not
    auto-pressed unless `pressOverall`. Presses pay the segment stake.
  - Team bets (2v2): each winner collects the stake, each loser pays it.
  - Skins per-skin: each other player pays the winner. Validation = winner must
    tie or win the next hole; skins on 18 need none; ties after 18 go unwon.
  - Wolf: lone/blind wolf wins or loses stake x multiplier with each of the 3.
  - Vegas: a score of 10+ goes first; birdie flips the other team unless both
    teams birdie; net scores below 1 count as 1.

## Rules

- The game/money engine (Nassau, presses, skins, Wolf, Vegas, handicap strokes)
  is pure functions with tests. Money math must never be wrong.
- The app tracks and settles bets; it never holds or moves money. Venmo-style
  links only.
- Course data and GHIN handicaps need licensing; until then, user-entered
  courses and self-reported indexes.
- Setup in under 60 seconds. Big touch targets. Plain-English game rules.
