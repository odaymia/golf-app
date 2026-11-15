import { describe, it, expect, vi } from 'vitest';

// The module imports the Supabase client; the pure helpers don't need it.
vi.mock('./supabase.js', () => ({ supabase: {} }));
vi.mock('./social.js', () => ({ call: vi.fn(), mediaUrl: vi.fn(), PREMIUM: 'premium', signPremium: vi.fn() }));

const { groupByTime, notificationText } = await import('./notifications.js');

describe('groupByTime', () => {
  it('Today, This week, Earlier; empty groups dropped', () => {
    const now = new Date(2026, 10, 15, 12, 0); // Nov 15, noon
    const at = (d, h = 9) => new Date(2026, 10, d, h).toISOString();
    const list = [
      { id: 'a', createdAt: at(15, 8) },
      { id: 'b', createdAt: at(14, 23) },
      { id: 'c', createdAt: at(9, 0) },
      { id: 'd', createdAt: at(8, 23) },
    ];
    const g = groupByTime(list, now);
    expect(g.map((x) => [x.label, x.items.map((i) => i.id)])).toEqual([
      ['Today', ['a']],
      ['This week', ['b', 'c']],
      ['Earlier', ['d']],
    ]);
    expect(groupByTime([{ id: 'x', createdAt: at(1) }], now).map((x) => x.label)).toEqual(['Earlier']);
  });
});

describe('notificationText', () => {
  it('reads naturally for each type', () => {
    expect(notificationText({ type: 'like' })).toBe('liked your post.');
    expect(notificationText({ type: 'comment', body: 'Nice swing!' })).toBe('commented: Nice swing!');
    expect(notificationText({ type: 'follow' })).toBe('started following you.');
    expect(notificationText({ type: 'message', count: 1, body: 'Tee time?' })).toBe('sent you a message: Tee time?');
    expect(notificationText({ type: 'message', count: 3, body: 'Hello' })).toBe('sent you 3 messages: Hello');
    expect(notificationText({ type: 'review_request', body: 'Slice' })).toBe('sent you a swing to review: “Slice”');
    expect(notificationText({ type: 'review_answer', body: 'Grip' })).toBe('reviewed your swing: Grip');
  });
});
