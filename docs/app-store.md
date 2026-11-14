# Getting Scribble Golf Club into the App Store and Google Play

The iPhone and Android apps are the same app as the website, packaged with
Capacitor (`ios/` and `android/`). Build them with:

```bash
npm run build:native   # builds the app into dist-native/ and copies it into ios/ and android/
npm run open:ios       # opens the iPhone project in Xcode
npm run open:android   # opens the Android project in Android Studio
```

Every app change needs `npm run build:native` again, then a new upload.

App ID (bundle identifier / package name): **com.scribblegolfclub.app**

---

## Before you submit (one time)

- [ ] **Run `supabase/account_safety.sql`** (blocking + delete account) in Supabase.
- [ ] **Support email:** set up `support@scribblegolfclub.com` (GoDaddy → Email
      forwarding to your inbox). It's on the privacy policy, terms and listings.
- [ ] **Review the privacy policy and terms** at scribblegolfclub.com/privacy
      and /terms. They're written to match what the app does, but have a lawyer
      look before launch.
- [ ] **Commit to reviewing reports within 24 hours** (Supabase → Table Editor →
      `post_reports`). The terms promise it and Apple expects it. Delete
      offending posts there, and remove abusive users under Authentication.
- [ ] **Demo account for reviewers:** Supabase → Authentication → Users → Add
      user → email `review@scribblegolfclub.com`, a password, tick "Auto confirm".
      Sign in once with it in the app (Sign in → "Sign in with a password
      instead"), set up a profile, and create a small league so reviewers see
      real content.

## Apple (iPhone)

1. Join the **Apple Developer Program** ($99/year) at developer.apple.com,
   preferably as an organization (needs a free D-U-N-S number) so the seller
   shows as Scribble Golf Club.
2. Install **Xcode** from the Mac App Store. Recent Xcode needs a recent macOS;
   update macOS first if the App Store says so.
3. `npm run build:native && npm run open:ios`. In Xcode: select the **App**
   target → Signing & Capabilities → choose your team. Plug in your iPhone and
   press ▶ to try it.
4. In **App Store Connect** (appstoreconnect.apple.com) → My Apps → + New App:
   platform iOS, name "Scribble Golf Club", bundle ID com.scribblegolfclub.app.
5. Fill in the listing below, the **App Privacy** answers, and the age rating.
6. In Xcode: Product → Archive → Distribute App → App Store Connect → Upload.
   Then in App Store Connect pick the build, add review notes + demo account,
   and Submit for Review. First reviews usually take a day or a few days.

## Google (Android)

1. Create a **Google Play Console** account ($25 once) at
   play.google.com/console, preferably as an organization. New *personal*
   accounts must run a **closed test with 12+ testers for 14 days** before
   publishing.
2. Install **Android Studio**. `npm run build:native && npm run open:android`.
3. Build → Generate Signed App Bundle → create an upload key (keep it safe and
   backed up; you need it for every update) → release `.aab`.
4. In Play Console: Create app → fill in the listing below, **Data safety**,
   content rating questionnaire, target audience (18+ recommended), then upload
   the `.aab` to a testing track, then production.

---

## Listing text

**Name:** Scribble Golf Club
**Subtitle (iOS, 30 max):** Golf games, leagues, settle-up
**Category:** Sports (secondary: Social Networking)

**Promotional text (iOS, 170 max):**
Score your round on one phone. Nassau, skins, Wolf, Vegas and Stableford run
themselves, and settle-up shows exactly who owes who.

**Description:**

Golf with your crew, minus the math.

Scribble Golf Club keeps score for your foursome, runs your league or
tournament, and settles up to the penny. Share photos from the course with the
golfers you play with.

THE GAMES
• Nassau with manual and automatic presses
• Skins with carryovers and validation
• Wolf: partner, lone wolf or blind wolf
• Vegas with the birdie flip
• Stableford: standard, modified or your own points, solo or 2 vs 2
• Match play and stroke play, net or gross
Handicap strokes are worked out for you from each player's index and the
course's rating and slope.

SETTLE UP
Every game nets out into the fewest payments possible. Scribble never holds
or moves money; pay each other however you like.

LEAGUES AND TOURNAMENTS
• Single players, teams, or a Ryder Cup between two sides
• Four-ball, combined score, scramble, foursomes and singles
• Season points with majors worth more, win/loss records, live leaderboards
• Live match play: 3 UP, dormie, 4 & 3, with full scorecards
• Invite players with a code; commissioners set groups and rounds

THE FEED
Post photos and videos from your rounds, follow golfers, and tap a course to
see how it looks right now.

Built for the course: big buttons, works with no signal, thousands of courses
to search.

**Keywords (iOS, 100 max):**
golf,scorecard,nassau,skins,wolf,vegas,stableford,league,tournament,ryder cup,handicap,match play

**Support URL:** https://scribblegolfclub.com
**Marketing URL:** https://scribblegolfclub.com
**Privacy policy URL:** https://scribblegolfclub.com/privacy/

## Review notes (paste into App Store Connect / Play Console)

> Demo account: review@scribblegolfclub.com / (your password). On the sign-in
> screen tap "Sign in with a password instead".
>
> Scribble keeps score of golf rounds and friendly side games between players
> and shows who owes whom at the end. The app never collects, holds or
> transfers money, takes no fees, and has no payments for these games; players
> settle among themselves outside the app.
>
> User content: members can post photos/videos and comments. Every post has
> Report and Block in its ⋯ menu, profiles have Block, blocked users are
> hidden both ways, and reports are reviewed within 24 hours. Users can delete
> their account in Profile → Settings → Delete account.

## Age rating

Answer the questionnaires honestly. Likely answers:
- **Gambling / simulated gambling:** the app tracks wagers between friends but
  has no real-money gambling. Apple: "Simulated Gambling: Infrequent/Mild" or
  as the questionnaire describes; this usually means **17+**. Google: no real
  gambling; mark simulated gambling if asked.
- **User-generated content:** yes (with reporting and blocking).

## Privacy answers (Apple "App Privacy" / Google "Data safety")

Data collected, linked to the user, used for **app functionality** only, not
for tracking, not sold:
- Contact info: **email address**
- User content: **photos or videos**, **other user content** (posts, comments,
  scores)
- Identifiers: **user ID**
- Other: **name**, handicap index, home course (profile info)

Not collected: precise or coarse location, contacts, browsing history,
purchases, financial info, diagnostics/analytics.
Data is encrypted in transit (HTTPS). Users can request deletion (in-app
Delete account).

## Screenshots

Needed sizes: iPhone 6.9" (1320 × 2868) and Android phone. Take them from the
app with real-looking data (the demo account): the scoring screen, settle-up,
a tournament leaderboard, a match scorecard, the feed and a profile.
