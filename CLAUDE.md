# Scribble Golf Club

Scribble Golf Club (repo `golf-app`) is a golf app for leagues, daily tournaments, and foursomes playing betting games
on the course. Goal: everything Golf Genius does, but far easier to use. Ships
with a website (marketing page + public league/event pages).

Separate product from the shop apps (time clock, Shop Desk). Own repo, own
deploy, own Supabase project.

## Plan

1. Foursome MVP: pick course, add players, pick games, hole-by-hole scoring,
   live settle-up ("Mike owes Dave $14"). **Built (Phase 1).**
2. Leagues: season schedule, pairings, standings, points, league handicaps.
   **Built:** league builder, invite codes, rounds, matches, standings.
3. Tournaments: flights, shotgun/tee times, big leaderboard, side pots, payouts.
   **Built:** tournaments (one-day or multi-round; stroke, Stableford, teams,
   Ryder Cup) with live leaderboards. Not yet: flights, tee times, payouts.
4. Business: club/organizer accounts, branding, paid tiers, App Store builds.

## Stack

Two pages from one Vite build: the website at `/` (`index.html`, static HTML
+ `src/site/`) and the app at `/app/` (`app/index.html`). The app is Vite 5 +
React 18 (plain JS, no router) as an offline-first PWA
(`vite-plugin-pwa`, service worker precaches the app). Rounds and courses live
on the device in IndexedDB. Supabase project `qdnrmeipmggpxynggsnl` holds
accounts, profiles, saved players and leagues (casual-round sync and realtime
leaderboards come later). Capacitor later for App Store / Play Store.

## Commands

```bash
npm run dev        # dev server (http://localhost:5173)
npm test           # Vitest, all engine + setup + storage tests
npm run test:watch
npm run lint       # ESLint 9 flat config
npm run build      # production build + service worker into dist/
npm run preview    # serve dist/
```

## Deploy

Live at https://scribblegolfclub.com (domain at GoDaddy, GitHub Pages
custom domain; the old https://odaymia.github.io/golf-app/ redirects there).
Public repo `odaymia/golf-app`. Every push to `main` runs
`.github/workflows/deploy.yml`: `npm ci`, `npm test`, `npm run build`, then
deploys `dist/` to GitHub Pages (repo Settings → Pages → Source: GitHub
Actions). A failing test blocks the deploy.

- Website at `/`, app at `/app/` (Vite multi-page input in `vite.config.js`).
  PWA `start_url` is `/app/`; offline navigations under `/app/` fall back to
  `app/index.html`. League invites link to `/app/`.
- Builds use base path `/` for the custom domain. DNS at
  GoDaddy: `@` A records to GitHub Pages (185.199.108-111.153), `www` CNAME to
  `odaymia.github.io`. Custom domain + Enforce HTTPS are set in repo
  Settings → Pages (the workflow deploy ignores a CNAME file).
- The PWA manifest's `start_url`/`scope` and the service worker scope follow
  the base path. Brand: `public/logo.png` (transparent wordmark, shown on
  sign-in and home), icons are the white logo on logo green #065025:
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png` (iPhone home screen), `favicon.png`.
- Install on iPhone: open https://scribblegolfclub.com in Safari → Share → Add to Home Screen.
- Updates: the service worker auto-updates, and `main.jsx` checks for a new
  version whenever the app returns to the foreground (iPhone home-screen apps
  resume rather than relaunch) and every 30 min. An update reloads the page;
  `App.jsx` keeps the open round in sessionStorage and reopens it.

## Structure

```
index.html          Website homepage (static; features, Log in -> /app/)
app/index.html      App entry (loads src/main.jsx)
src/
  site/             Website styles + entry (site.css, site.js)
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
      stableford.js Stableford rules (presets, custom, natural bonuses) shared
                    with leagues, plus the casual game: individual or 2v2
                    team (best ball / both balls), per point or flat stake
      settle.js     Fewest-payments settle-up (exact bitmask search)
      round.js      computeRound(round): strokes, every game, totals, payments
      *.test.js     Tests live next to each module; test-helpers.js builds cards
    roundSetup.js   Setup defaults, plain-English rules, settings -> engine configs
    courseSearch.js The only OpenGolfAPI network code (search + course detail)
    courseImport.js Pure: API course -> our course shape, with warnings
    storage.js      The only IndexedDB code (rounds + saved courses)
    league/         Pure league engine. No React, network or storage.
      format.js     Builder options, valid combinations, defaults, labels
      event.js      One round: handicaps, stroke/Stableford board, matches,
                    points by finish (ties split), W/L/T, Ryder Cup points
      season.js     computeLeague + standings per season type, round robin
      leagueHandicap.js  Adjusted gross (net double bogey), differentials,
                    league index (best N of last M), per-event indexes
      league.test.js
    leagueApi.js    The only league Supabase code; offline cache + score queue
    supabase.js     Supabase client (URL + publishable key; safe to ship)
    account.js      The only Supabase code: email-code sign-in, profile,
                    saved players, with an offline cache in localStorage
  components/       SignIn, Profile (+ My players), Home (+ LeaguesSection),
                    Setup (+ CourseSearch), Play (Score/Money/Card tabs), Settle,
                    League -> LeagueHome / LeagueEvent / LeagueBuilder,
                    TournamentBoard, MatchCard, useLiveRefresh,
                    controls.jsx (Switch, Toggle, Seg, OptionCards)
  App.jsx           Sign-in gate -> first-time profile -> screens; saves the
                    round on every change
supabase/schema.sql   Profiles + saved players; paste into the SQL Editor
supabase/leagues.sql  League tables, policies, create_league/join_league RPCs
supabase/league_tiers.sql  Adds league_events.tier (regular/major)
supabase/groups.sql   Adds league_events.groups + can_score() score policies
supabase/social.sql   Social tables, policies and the `media` storage bucket
supabase/home_course.sql  public_profiles.home_course_key / _place
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

## Accounts

- Sign-in is a 6-digit email code (`signInWithOtp` + `verifyOtp`), not a
  magic link: a link would open Safari instead of the home-screen app. The
  Supabase email templates (Magic Link and Confirm signup) must include
  `{{ .Token }}`. The built-in mailer allows only a few emails per hour; add
  custom SMTP before a league signs up.
- The session is stored on the phone, so the app opens signed in with no
  signal. First sign-in requires a name (first-time Profile screen).
- `profiles` (one per user) and `saved_players` (private to the owner) are
  protected by row level security in `supabase/schema.sql`. Schema changes go
  in that file; the user runs it in the SQL Editor.
- Never ship the service_role/secret key. GHIN: handicap index and GHIN number
  are self-reported until the USGA approves an integration; that integration
  must run server-side (e.g. a Supabase Edge Function), never in the app.

## Leagues

- `leagues.settings` (jsonb) holds the format; `normalizeSettings` fills
  defaults and drops invalid combos. Units: individual / teams (2 or 4) /
  ryder (two named sides). Scoring: stroke / stableford / match, net or
  gross. Season: points (by finish, ties split, optional best-N weeks;
  FedEx Cup style: each round is `tier` regular or major, majors pay
  `majorMultiplier`x; `fieldSize` = players in the league sets one points
  row per place, from a preset (fedex/even) or custom) /
  cumulative (Stableford total, stroke lowest average) / record (W-L-T,
  win 2 tie 1 by default) / ryder (win 1, halve ½).
- Stableford (`settings.stableford`, rules in `games/stableford.js`, UI in
  `components/StablefordScoring.jsx`, shared with casual rounds): points per result from a preset
  (standard 5/4/3/2/1/0, modified 8/5/2/0/-1/-3) or custom, applied to net or
  gross per `net`. Optional natural bonus (`bonusOn`) adds points for a gross
  birdie/eagle/albatross/ace regardless of strokes; an ace takes the ace bonus
  instead of eagle/albatross. Team best ball takes the higher points.
- Members: app users join with the 6-character invite code (`join_league`
  RPC, which also claims a name-only spot with the same name); the
  commissioner adds people without the app. `team` is the team or side name.
- Rounds (`league_events`) snapshot the course + tee. Only commissioners
  manage members, rounds, matches and groups, and mark rounds final.
  Players may enter scores only for their own group (`league_events.groups`,
  or their match when no group includes them); commissioners for anyone.
  Enforced by `public.can_score()` (supabase/groups.sql) and mirrored in
  `src/lib/league/groups.js` (keep them in step). Everyone can read all
  scores. Only final rounds count in standings, and
  members can't change scores after final (enforced by RLS).
- Matches (league and casual) stop at the closeout ("4 & 3"). Live match
  play: `matchSummary(status)` gives the scoreboard text (3 UP / ALL SQUARE
  / DORMIE / 4 & 3) and `MatchCard` shows it with hole-by-hole dots, on the
  scoring screen (from the phone's own cards, before sending) and on league
  Results, which re-fetch every 20 s while a round is open. Ryder Cup
  Results add a points board and who's leading on the course. Handicaps: own index or
  league index from earlier final rounds only; allowance %, max handicap,
  strokes off the low player per match.
- Scores go to a localStorage queue first and are sent when online
  (`flushScores`); refused cards are dropped so they can't block the queue.

## Tournaments

- A tournament is a league with `settings.kind = 'tournament'` (same tables,
  invite codes, rounds, scoring screens; no schema change). `rounds` is the
  planned number of rounds. Scoring: stroke or Stableford for players/teams,
  match play for Ryder Cup. Handicaps: own index + allowance/max/off-low (no
  league-handicap mode).
- Standings are live: `tournamentStandings` counts every round as it is
  played, final or not. Stroke/Stableford rows: total (to par or points),
  today, thru, and each round (a round in progress shows score so far with
  holes played). Ryder Cup: points per round, total, and a projection that
  adds matches on the course (leading = 1, all square = ½).
- `TournamentBoard` renders it and refreshes every 20 s while any round is
  open. Matches in team formats need every player assigned a team/side.
- Match formats (`MATCH_FORMATS` in league/event.js), stored per match in
  `league_events.matchups[].format`; the commissioner sets one per round in
  Manage: singles, fourball (best ball), combined score (internal key "shamble", both balls added),
  scramble and foursomes (one team ball). One-ball formats use a team
  handicap (scramble 35% low + 15% high; foursomes half the total) off the
  low team; the team score is saved on every partner's card and score entry
  shows one row per team.
- Tapping a match card opens `MatchScorecard` (bottom sheet): every player's
  gross with stroke dots, the team row (best ball / both added, net), the
  team ball for one-ball formats, and a running match row. Matches expose
  `sideScores` and `running` (league/event.js and games/match.js) for it.

## Social feed

- Bottom tab bar (`BottomNav`): Golf (rounds/leagues/tournaments), Feed, +
  (new post), Profile. Social screens live in `components/social/` under
  `Social.jsx`, which keeps its own back stack.
- Data (`lib/social.js`, the only code touching these tables and the
  `media` storage bucket): `public_profiles` (username, display name, bio,
  avatar, home course; readable by all signed-in users; handicap/GHIN stay
  private in `profiles`), `posts` (caption + course tag), `post_media`,
  `post_likes`, `post_comments`, `follows`, `post_reports` (write-only;
  review in the Supabase dashboard). Schema + RLS + bucket in
  supabase/social.sql. Members can only upload/delete in their own
  `<userId>/` folder.
- Media: photos are shrunk on the phone to 1440px JPEG (`lib/media.js`),
  avatars to 480px; videos upload as-is (50 MB cap) with a frame grabbed as
  the grid cover. Public URLs, newest first everywhere.
- Location pages: posts tagged with a searched course share its
  `oga-<id>` key, so `CoursePage` gathers everyone's photos of that course.
- A username is required before using social; the profile page asks.
- Home course (golf profile and account Settings) uses `HomeCoursePicker`:
  the same course search as rounds/tags, saved with its course key
  (`public_profiles.home_course_key/place`, supabase/home_course.sql) so it
  links to the course page; a typed name (no key) is allowed. Settings
  mirrors its choice onto the public profile (`syncHomeCourse`).
- Before App Store submission: add blocking users and a way to act on
  reports (Apple requires report + block for user-generated content).

## Course data

Course search uses OpenGolfAPI (https://api.opengolfapi.org/api/v1),
called straight from the phone (CORS is open).
- No API key in the app: search and detail work without one (per-device daily
  limit), and anything shipped in a public PWA is readable by anyone. Keep the
  user's key out of the repo; it's only useful later from a server.
- Data is ODbL 1.0. Show the attribution `© OpenStreetMap contributors (ODbL
  1.0) via OpenGolfAPI` wherever results appear. A shared course database
  built from it (e.g. in Supabase) must also be ODbL.
- Data is community-maintained: `courseImport.js` drops stray holes past 18,
  plays 9-hole courses twice (stroke index n -> 2n-1 out, 2n in), doubles
  9-hole ratings, and fills missing pars/handicaps/ratings with defaults plus a
  warning shown in setup. Picked courses save to IndexedDB with id `oga-<id>`,
  so a course you've fixed keeps your fixes and works offline.

## Look and feel

Vintage clubhouse style, inspired by classic golf brands and Augusta (no
other brand's names or marks): aged cream paper (#f4eedf), logo green
#065025 with deep green #033a1a, flag-yellow gold #d9b04a, a touch of azalea
#b8466f, red for under par. Headlines in Fraunces (serif), labels and UI in
Montserrat, both self-hosted via @fontsource (Latin only) so they work
offline. The homepage centerpiece is a hand-operated-style leaderboard.

## Rules

- The game/money engine (Nassau, presses, skins, Wolf, Vegas, handicap strokes)
  is pure functions with tests. Money math must never be wrong.
- The app tracks and settles bets; it never holds or moves money. Venmo-style
  links only.
- GHIN handicaps need licensing; until then, self-reported indexes. Courses
  come from OpenGolfAPI search or are entered by hand.
- Setup in under 60 seconds. Big touch targets. Plain-English game rules.
