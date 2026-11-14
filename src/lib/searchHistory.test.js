import { describe, it, expect } from 'vitest';
import { addRecent, listRecent, removeRecent, clearRecent, rankPosts, MAX_RECENT } from './searchHistory.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

describe('recent searches', () => {
  it('newest first, no duplicates (case-insensitive), per account', () => {
    const s = memory();
    addRecent('me', { type: 'query', q: 'Torrey Pines' }, s);
    addRecent('me', { type: 'profile', profile: { id: 'u1', username: 'mikej' } }, s);
    addRecent('me', { type: 'query', q: '  torrey pines ' }, s);
    expect(listRecent('me', s).map((e) => e.q ?? e.profile.username)).toEqual(['torrey pines', 'mikej']);
    expect(listRecent('someone-else', s)).toEqual([]);
  });

  it('ignores blank searches, caps the list, removes and clears', () => {
    const s = memory();
    addRecent('me', { type: 'query', q: '   ' }, s);
    expect(listRecent('me', s)).toEqual([]);
    for (let i = 0; i < MAX_RECENT + 5; i++) addRecent('me', { type: 'query', q: `q${i}` }, s);
    expect(listRecent('me', s)).toHaveLength(MAX_RECENT);
    expect(listRecent('me', s)[0].q).toBe(`q${MAX_RECENT + 4}`);
    removeRecent('me', { type: 'query', q: `q${MAX_RECENT + 4}` }, s);
    expect(listRecent('me', s)[0].q).toBe(`q${MAX_RECENT + 3}`);
    clearRecent('me', s);
    expect(listRecent('me', s)).toEqual([]);
  });

  it('survives junk in storage', () => {
    const s = memory();
    s.setItem('golf-app:search:me', '{not json');
    expect(listRecent('me', s)).toEqual([]);
  });
});

describe('rankPosts', () => {
  const P = (id, caption, course, userId = 'x', createdAt = '2026-01-01') => ({ id, caption, course, userId, createdAt });
  it('course tag, then caption, then author; newest first within', () => {
    const posts = [
      P('author', 'nice day', null, 'u-torrey'),
      P('caption-old', 'Played Torrey Pines today', null, 'x', '2026-01-01'),
      P('tagged', '', { name: 'Torrey Pines South', place: 'La Jolla, CA' }),
      P('caption-new', 'torrey pines again', null, 'x', '2026-02-01'),
      P('other', 'Pebble', { name: 'Pebble Beach' }),
    ];
    expect(rankPosts(posts, 'Torrey Pines', new Set(['u-torrey'])).map((p) => p.id)).toEqual([
      'tagged',
      'caption-new',
      'caption-old',
      'author',
    ]);
  });
});
