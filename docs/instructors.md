# Instructor subscriptions

Golf instructors sell monthly subscriptions (tips, drills, swing reviews).
Scribble keeps a platform fee (`PLATFORM_FEE_BPS` in
`src/lib/instructor/fees.js`, 15% today); the instructor gets the rest.

## What works today (payments not live)

- **Teach on Scribble** (own profile → "Teach golf?"): headline, credentials,
  specialties, lesson info, and up to 4 tiers (price, perks, swing reviews
  per month), with a "you keep $X" preview.
- **Profile**: instructor card with tiers. Subscribe opens the tiers; with
  `PAYMENTS_LIVE = false` it records "notify me" interest
  (`subscription_interest`).
- **Subscriber-only posts**: instructors choose "Subscribers only" when
  posting. Media goes to the private `premium` bucket; the database returns
  those media rows, and storage signs links, only for the author and active
  subscribers. Everyone else sees a locked tile.
- **Free access ("comp")**: instructors give anyone access from the Studio
  (beta testers, students). Comp subscriptions earn nothing.
- **Swing reviews**: subscribers on a tier with reviews send a video (private
  bucket); the instructor answers in the Studio, and the answer is also sent
  as a DM. Monthly limit enforced by `reviews_left()` in the database.
- **Instructor Studio**: paying/free counts, monthly gross and "you keep",
  waiting list (and what it's worth), subscribers, reviews to answer.
- **Verified badge**: set `instructor_profiles.verified = true` in the Supabase
  Table Editor after checking credentials. Members can't set it.

## Going live with Stripe (to do)

Needs: the business's Stripe account with **Connect** turned on (ideally under
the LLC), test keys first. Keys live only in Supabase Edge Function secrets,
never in the app.

1. **Onboarding** — Edge Function `stripe-connect`: create an Express
   connected account for the instructor, save `stripe_account_id` (service
   role), return an Account Link URL; the Studio shows "Set up payouts".
2. **Prices** — when tiers are saved, an Edge Function creates/updates a
   Stripe Product + monthly Price on the connected account and stores
   `stripe_price_id` (service role; members can't write it).
3. **Checkout** — `startCheckout(tier)` in `src/lib/instructor/payments.js`
   calls Edge Function `create-checkout`: a Checkout Session in subscription
   mode with `subscription_data.application_fee_percent = PLATFORM_FEE_BPS / 100`
   and `transfer_data.destination` (or on the connected account), success URL
   back to the instructor's profile. Set `PAYMENTS_LIVE = true`.
4. **Webhook** — Edge Function `stripe-webhook` (verify the signature):
   `checkout.session.completed`, `customer.subscription.updated/deleted`,
   `invoice.payment_failed` → upsert `instructor_subscriptions` with
   `source = 'stripe'`, `status`, `current_period_end`,
   `stripe_subscription_id`. Only the service role writes paid rows.
5. **Manage / cancel** — Stripe customer portal link from the instructor card.
6. **Tell the waiting list** — message everyone in `subscription_interest`.
7. **iPhone** — subscriptions are sold on the website (Stripe Checkout). In
   the US the app may link out to it; check Apple's current link-out rules
   (and Google Play's) before launch.
8. **Legal** — instructor agreement, refunds, content rules, payouts/taxes
   (Stripe Express handles 1099-K); have a lawyer review the terms.
