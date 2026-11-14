// Taking payment for instructor subscriptions. NOT LIVE YET.
//
// When Stripe is set up (see docs/instructors.md), this is the only place the
// app starts a payment:
//   1. startCheckout(tier) calls a Supabase Edge Function that creates a
//      Stripe Checkout Session on the instructor's connected account with
//      application_fee_percent = PLATFORM_FEE_BPS / 100, and returns its URL.
//   2. The app opens that URL (on iPhone: the web checkout link-out).
//   3. Stripe's webhook (another Edge Function, service role) writes the
//      instructor_subscriptions row with source 'stripe'. The app never
//      writes paid subscriptions itself, and never sees card details.
// Until then, Subscribe records interest ("notify me") instead.

export const PAYMENTS_LIVE = false;

export async function startCheckout() {
  throw new Error('Paid subscriptions aren’t open yet.');
}
