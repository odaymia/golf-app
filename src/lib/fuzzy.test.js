import { describe, it, expect } from 'vitest';
import { editDistance, keyWords, matchScore, rankClose } from './fuzzy.js';

describe('editDistance', () => {
  it('counts single-letter edits', () => {
    expect(editDistance('steel', 'steele')).toBe(1);
    expect(editDistance('stele', 'steele')).toBe(1);
    expect(editDistance('canyon', 'canyon')).toBe(0);
    expect(editDistance('torey', 'torrey')).toBe(1);
    expect(editDistance('abc', 'xyzxyz', 2)).toBe(3); // stops early past max
  });
});

describe('matchScore', () => {
  const steele = 'Steele Canyon Golf Club Canyon Ranch';
  it('finds misspellings', () => {
    expect(matchScore('steel canyon', steele)).not.toBe(null);
    expect(matchScore('stele canyon', steele)).not.toBe(null);
    expect(matchScore('Steele Canyon', steele)).toBe(0);
    expect(matchScore('torey pines', 'Torrey Pines South')).not.toBe(null);
    expect(matchScore('pebble', 'Pebble Beach Golf Links')).toBe(0);
  });
  it('rejects names missing a typed word', () => {
    expect(matchScore('steel canyon', 'Apple Canyon Lake Golf Course')).toBe(null);
    expect(matchScore('steele canyon', 'Steel Club')).toBe(null);
    expect(matchScore('golf club', 'Anything')).toBe(null); // only filler words
  });
  it('ignores filler words', () => {
    expect(keyWords('The Steele Canyon Golf Club')).toEqual(['steele', 'canyon']);
    expect(matchScore('steele canyon golf course', steele)).toBe(0);
  });
});

describe('rankClose', () => {
  it('keeps close matches, best first', () => {
    const items = [
      { name: 'Apple Canyon Lake Golf Course' },
      { name: 'Steele Canyon Golf Club Canyon Vineyard' },
      { name: 'Steel Canyon Golf Club' },
      { name: 'Black Canyon Golf Course' },
    ];
    expect(rankClose('steel canyon', items).map((x) => x.name)).toEqual([
      'Steel Canyon Golf Club',
      'Steele Canyon Golf Club Canyon Vineyard',
    ]);
    expect(rankClose('stele canyon', items).map((x) => x.name)[0]).toBe('Steele Canyon Golf Club Canyon Vineyard');
  });
});
