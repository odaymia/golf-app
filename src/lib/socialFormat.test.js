import { describe, it, expect } from 'vitest';
import {
  cleanUsername,
  usernameProblem,
  suggestUsername,
  timeAgo,
  courseTag,
  countLabel,
  compactCount,
  mediaPath,
} from './socialFormat.js';

describe('usernames', () => {
  it('cleans what people type', () => {
    expect(cleanUsername('  @Omar Daymia! ')).toBe('omardaymia');
    expect(cleanUsername('big_hitter.22')).toBe('big_hitter.22');
  });
  it('explains problems in plain English', () => {
    expect(usernameProblem('')).toBe('Pick a username.');
    expect(usernameProblem('ab')).toMatch(/at least 3/);
    expect(usernameProblem('a'.repeat(25))).toMatch(/at most 24/);
    expect(usernameProblem('omar')).toBe(null);
  });
  it('suggests one from the name', () => {
    expect(suggestUsername('Omar Daymia')).toBe('omardaymia');
    expect(usernameProblem(suggestUsername('Al'))).toBe(null);
    expect(usernameProblem(suggestUsername(''))).toBe(null);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-14T12:00:00Z').getTime();
  const ago = (sec) => new Date(now - sec * 1000).toISOString();
  it('short relative times', () => {
    expect(timeAgo(ago(20), now)).toBe('just now');
    expect(timeAgo(ago(5 * 60), now)).toBe('5m');
    expect(timeAgo(ago(3 * 3600), now)).toBe('3h');
    expect(timeAgo(ago(2 * 86400), now)).toBe('2d');
    expect(timeAgo(ago(15 * 86400), now)).toBe('2w');
    expect(timeAgo(ago(60 * 86400), now)).toMatch(/2026/);
  });
});

describe('formatting', () => {
  it('course tags', () => {
    expect(courseTag({ id: 'oga-1', name: 'Pebble Beach', place: 'Pebble Beach, CA' })).toEqual({
      key: 'oga-1',
      name: 'Pebble Beach',
      place: 'Pebble Beach, CA',
    });
    expect(courseTag(null)).toBe(null);
  });
  it('counts', () => {
    expect(countLabel(1, 'like')).toBe('1 like');
    expect(countLabel(3, 'like')).toBe('3 likes');
    expect(countLabel(2, 'reply', 'replies')).toBe('2 replies');
    expect([5, 999, 1234, 12345, 1250000].map(compactCount)).toEqual(['5', '999', '1.2K', '12K', '1.3M']);
  });
  it('media paths live in the uploader’s folder', () => {
    expect(mediaPath('u1', 'p1', 0, 'jpg')).toBe('u1/p1/0.jpg');
  });
});
