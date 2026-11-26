import { describe, it, expect, vi } from 'vitest';
vi.mock('./supabase.js', () => ({ supabase: {} }));
const { isUnread } = await import('./leagueChat.js');

describe('chat unread dot', () => {
  const msg = (userId, createdAt) => ({ id: 'm', userId, body: 'hi', createdAt });
  it('is unread when someone else posted after my last visit', () => {
    expect(isUnread(msg('u2', '2026-11-25T10:00:00Z'), 'u1', '2026-11-25T09:00:00Z')).toBe(true);
    expect(isUnread(msg('u2', '2026-11-25T10:00:00Z'), 'u1', '')).toBe(true);
  });
  it('is read for my own message, an older one, or no messages', () => {
    expect(isUnread(msg('u1', '2026-11-25T10:00:00Z'), 'u1', '')).toBe(false);
    expect(isUnread(msg('u2', '2026-11-25T08:00:00Z'), 'u1', '2026-11-25T09:00:00Z')).toBe(false);
    expect(isUnread(null, 'u1', '')).toBe(false);
  });
});
