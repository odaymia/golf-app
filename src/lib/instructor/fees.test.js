import { describe, it, expect } from 'vitest';
import { splitPayment, parsePrice, priceProblem, formatPrice, monthlyEarnings, cardFeeEstimate, PLATFORM_FEE_BPS } from './fees.js';

describe('splitPayment', () => {
  it('takes 15% and always sums to the price', () => {
    expect(PLATFORM_FEE_BPS).toBe(1500);
    expect(splitPayment(1000)).toEqual({ platform: 150, instructor: 850 });
    expect(splitPayment(999)).toEqual({ platform: 149, instructor: 850 }); // 149.85 -> 149
    for (let p = 0; p <= 50000; p += 37) {
      const s = splitPayment(p);
      expect(s.platform + s.instructor).toBe(p);
      expect(s.platform).toBeGreaterThanOrEqual(0);
    }
  });
  it('custom fee and bad input', () => {
    expect(splitPayment(2000, 1000)).toEqual({ platform: 200, instructor: 1800 });
    expect(() => splitPayment(9.99)).toThrow();
    expect(() => splitPayment(-1)).toThrow();
  });
});

describe('prices', () => {
  it('parses dollars', () => {
    expect(parsePrice('9.99')).toBe(999);
    expect(parsePrice('$10')).toBe(1000);
    expect(parsePrice(' 4.5 ')).toBe(450);
    expect(parsePrice('abc')).toBe(null);
    expect(parsePrice('1.234')).toBe(null);
  });
  it('limits and formatting', () => {
    expect(priceProblem(99)).toMatch(/lowest/);
    expect(priceProblem(50001)).toMatch(/highest/);
    expect(priceProblem(999)).toBe(null);
    expect(formatPrice(999)).toBe('$9.99');
    expect(formatPrice(1000)).toBe('$10');
    expect(formatPrice(1005)).toBe('$10.05');
    expect(cardFeeEstimate(1000)).toBe(59);
    expect(cardFeeEstimate(0)).toBe(0);
  });
});

describe('monthlyEarnings', () => {
  it('counts only active paid subscriptions', () => {
    const tiers = [
      { id: 'basic', priceCents: 999 },
      { id: 'pro', priceCents: 2999 },
    ];
    const subs = [
      { status: 'active', source: 'stripe', tierId: 'basic' },
      { status: 'active', source: 'stripe', tierId: 'pro' },
      { status: 'active', source: 'comp', tierId: 'pro' },
      { status: 'canceled', source: 'stripe', tierId: 'pro' },
    ];
    const e = monthlyEarnings(subs, tiers);
    expect(e.paying).toBe(2);
    expect(e.gross).toBe(3998);
    expect(e.platform + e.instructor).toBe(3998);
    expect(e.platform).toBe(149 + 449);
    expect(e.cardEstimate).toBe(cardFeeEstimate(999) + cardFeeEstimate(2999));
    expect(e.netEstimate).toBe(e.instructor - e.cardEstimate);
  });
});
