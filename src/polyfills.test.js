import { describe, it, expect, vi, afterEach } from 'vitest';

describe('fallbacks for older phones', () => {
  const realAt = Array.prototype.at;
  const realStrAt = String.prototype.at;
  const realClone = globalThis.structuredClone;
  afterEach(() => {
    Object.defineProperty(Array.prototype, 'at', { value: realAt, configurable: true, writable: true });
    Object.defineProperty(String.prototype, 'at', { value: realStrAt, configurable: true, writable: true });
    globalThis.structuredClone = realClone;
  });

  it('adds .at() and structuredClone when the browser lacks them', async () => {
    delete Array.prototype.at;
    delete String.prototype.at;
    globalThis.structuredClone = undefined;
    vi.resetModules();
    await import('./polyfills.js');
    expect([1, 2, 3].at(-1)).toBe(3);
    expect([1, 2, 3].at(0)).toBe(1);
    expect([1, 2, 3].at(5)).toBe(undefined);
    expect('abc'.at(-2)).toBe('b');
    const round = { scores: { a: [4, null, 5] }, games: [{ type: 'stroke', stake: 500 }] };
    const copy = structuredClone(round);
    expect(copy).toEqual(round);
    expect(copy.scores.a).not.toBe(round.scores.a);
  });
});
