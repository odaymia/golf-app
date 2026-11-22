import { describe, it, expect, vi, afterEach } from 'vitest';
import { DOWN_MESSAGE, matchSaved, searchCourses } from './courseSearch.js';

const saved = [
  { id: 'oga-1', name: 'Steele Canyon Golf Club' },
  { id: 'oga-2', name: 'Torrey Pines South' },
  { id: 'c-3', name: 'Cottonwood Golf Club' },
];

describe('courses saved on this phone', () => {
  it('matches by the words typed, ignoring golf/club filler', () => {
    expect(matchSaved('steele', saved).map((c) => c.id)).toEqual(['oga-1']);
    expect(matchSaved('torrey pines', saved).map((c) => c.id)).toEqual(['oga-2']);
    expect(matchSaved('golf club', saved).map((c) => c.id)).toEqual(['oga-1', 'c-3']);
  });
  it('allows small typos', () => {
    expect(matchSaved('steel canyon', saved).map((c) => c.id)).toEqual(['oga-1']);
  });
  it('needs two letters and finds nothing unrelated', () => {
    expect(matchSaved('s', saved)).toEqual([]);
    expect(matchSaved('pebble beach', saved)).toEqual([]);
  });
});

describe('when the course database is down', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('a server error says it is down instead of a status code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await expect(searchCourses('torrey pines')).rejects.toThrow(DOWN_MESSAGE);
  });
  it('busy (429) keeps its own message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })));
    await expect(searchCourses('torrey pines')).rejects.toThrow(/busy/);
  });
});
