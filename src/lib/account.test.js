import { describe, it, expect } from 'vitest';
import { normalizeEmail, looksLikeEmail } from './account.js';

describe('email helpers', () => {
  it('normalizes and checks emails', () => {
    expect(normalizeEmail('  Mike@Example.COM ')).toBe('mike@example.com');
    expect(looksLikeEmail('mike@example.com')).toBe(true);
    expect(looksLikeEmail('mike@example')).toBe(false);
    expect(looksLikeEmail('mike example.com')).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });
});
