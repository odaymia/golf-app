import { describe, it, expect, vi, afterEach } from 'vitest';
import { DOWN_MESSAGE, detailFromRow, matchSaved, searchCourses } from './courseSearch.js';
import { courseFromApi } from './courseImport.js';

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

describe('our Supabase copy of the course data', () => {
  it('turns a row into a course the same way as the API', () => {
    const row = {
      id: '0e1e596d-8e86-4ff8-90e9-6a439a0ba271',
      name: 'Egyptian Country Club',
      city: 'Mounds',
      state: 'IL',
      holes: 9,
      par: 36,
      scorecard: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((hole) => ({ hole, par: hole % 3 ? 4 : 3, handicap_index: [9, 5, 1, 7, 3, 8, 4, 6, 2][hole - 1] })),
    };
    const d = detailFromRow(row);
    expect(d.holes_data[0]).toEqual({ number: 1, par: 4, handicap_index: 9 });
    const { course, warnings } = courseFromApi(d);
    expect(course.id).toBe('oga-0e1e596d-8e86-4ff8-90e9-6a439a0ba271');
    expect(course.name).toBe('Egyptian Country Club');
    expect(course.place).toBe('Mounds, IL');
    expect(course.holes).toHaveLength(18); // nine played twice
    expect(course.tees).toEqual([{ name: 'White', rating: course.holes.reduce((s, h) => s + h.par, 0), slope: 113 }]);
    expect(warnings.join(' ')).toMatch(/No tee ratings/);
  });
});
