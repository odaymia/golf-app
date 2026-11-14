// Instructor subscription money math. Pure, integer cents, no network.
//
// Platform fee: we keep PLATFORM_FEE_BPS (basis points, 1500 = 15%) of each
// subscription payment; the instructor gets the rest. Card processing fees
// (Stripe) come out separately once payments are live; here they are only an
// estimate, and the dashboard labels them as one.

export const PLATFORM_FEE_BPS = 1500; // 15%
export const MIN_PRICE_CENTS = 100; // $1
export const MAX_PRICE_CENTS = 50000; // $500
// Estimate only (US cards): 2.9% + 30¢ per charge.
export const CARD_FEE_BPS = 290;
export const CARD_FEE_FIXED_CENTS = 30;

// { platform, instructor } for one payment; always sums to the price.
// The platform's share rounds down to the cent (the instructor keeps the half cent).
export function splitPayment(priceCents, feeBps = PLATFORM_FEE_BPS) {
  if (!Number.isInteger(priceCents) || priceCents < 0) throw new Error('price must be whole cents');
  const platform = Math.floor((priceCents * feeBps) / 10000);
  return { platform, instructor: priceCents - platform };
}

export const cardFeeEstimate = (priceCents) =>
  priceCents > 0 ? Math.round((priceCents * CARD_FEE_BPS) / 10000) + CARD_FEE_FIXED_CENTS : 0;

// "$9.99" -> 999; "10" -> 1000; bad input -> null.
export function parsePrice(text) {
  const m = /^\s*\$?\s*(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

export function priceProblem(cents) {
  if (cents == null) return 'Enter a price like 9.99.';
  if (cents < MIN_PRICE_CENTS) return 'The lowest price is $1.';
  if (cents > MAX_PRICE_CENTS) return 'The highest price is $500 a month.';
  return null;
}

export const formatPrice = (cents) =>
  `$${Math.floor(cents / 100)}${cents % 100 ? `.${String(cents % 100).padStart(2, '0')}` : ''}`;

// Monthly totals for an instructor's paid, active subscriptions.
// subs: [{ status, source, tierId }]; tiers: [{ id, priceCents }]
// Free ('comp') access earns nothing.
export function monthlyEarnings(subs, tiers, feeBps = PLATFORM_FEE_BPS) {
  const price = new Map(tiers.map((t) => [t.id, t.priceCents]));
  let gross = 0;
  let platform = 0;
  let instructor = 0;
  let card = 0;
  let paying = 0;
  for (const s of subs) {
    if (s.status !== 'active' || s.source !== 'stripe') continue;
    const p = price.get(s.tierId) ?? 0;
    const split = splitPayment(p, feeBps);
    gross += p;
    platform += split.platform;
    instructor += split.instructor;
    card += cardFeeEstimate(p);
    paying += 1;
  }
  return { paying, gross, platform, instructor, cardEstimate: card, netEstimate: instructor - card };
}

// What a golfer pays and what the instructor keeps, for the tier editor.
export function tierPreview(priceCents, feeBps = PLATFORM_FEE_BPS) {
  const { platform, instructor } = splitPayment(priceCents, feeBps);
  return { platform, instructor, cardEstimate: cardFeeEstimate(priceCents) };
}
