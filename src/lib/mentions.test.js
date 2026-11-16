import { describe, it, expect } from 'vitest';
import { splitMentions, activeMention, insertMention } from './mentions.js';

describe('splitMentions', () => {
  it('finds mentions and keeps the rest', () => {
    expect(splitMentions('Nice one @MikeJ and @dave_lee!')).toEqual([
      { text: 'Nice one ' },
      { mention: 'mikej', text: '@MikeJ' },
      { text: ' and ' },
      { mention: 'dave_lee', text: '@dave_lee' },
      { text: '!' },
    ]);
  });
  it('ignores emails and too-short names', () => {
    expect(splitMentions('mail bob@site.com or @ab')).toEqual([{ text: 'mail bob@site.com or @ab' }]);
    expect(splitMentions('@sam.putts')).toEqual([{ mention: 'sam.putts', text: '@sam.putts' }]);
    expect(splitMentions('')).toEqual([]);
  });
});

describe('activeMention', () => {
  it('detects an @ being typed at the caret', () => {
    expect(activeMention('great shot @mi')).toEqual({ start: 11, query: 'mi' });
    expect(activeMention('@')).toEqual({ start: 0, query: '' });
    expect(activeMention('great shot @mike nice', 16)).toEqual({ start: 11, query: 'mike' });
    expect(activeMention('email@site')).toBe(null);
    expect(activeMention('done @mike ')).toBe(null);
  });
});

describe('insertMention', () => {
  it('replaces the partial name and puts the caret after it', () => {
    expect(insertMention('great shot @mi', 14, 'mikej')).toEqual({ text: 'great shot @mikej ', caret: 18 });
    expect(insertMention('@da was here', 3, 'dave_lee')).toEqual({ text: '@dave_lee was here', caret: 10 });
    expect(insertMention('no mention', 10, 'x')).toEqual({ text: 'no mention', caret: 10 });
  });
});
