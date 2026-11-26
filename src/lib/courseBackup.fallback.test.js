import { describe, it, expect, vi, afterEach } from 'vitest';

const backup = vi.hoisted(() => ({
  backupCourse: vi.fn(),
  searchBackup: vi.fn(async () => [
    { id: '77', name: 'Steele Canyon Golf Club', place: 'Jamul, CA', backup: true },
    { id: '88', name: 'Torrey Pines South', place: 'La Jolla, CA', backup: true },
  ]),
  loadBackup: vi.fn(async () => ({ course_name: 'Steele Canyon Golf Club', holes: 18, holes_data: [{ number: 1, par: 4, handicap: 5 }] })),
}));
vi.mock('./courseBackup.js', () => backup);

const { searchCourses, fetchCourse, DOWN_MESSAGE } = await import('./courseSearch.js');

describe('shared course backup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('searches the backup when OpenGolfAPI is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const found = await searchCourses('steele canyon');
    expect(found.map((c) => c.id)).toEqual(['77']);
  });

  it('still says it is down when the backup has nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    backup.searchBackup.mockResolvedValueOnce([]);
    await expect(searchCourses('pebble beach')).rejects.toThrow(DOWN_MESSAGE);
  });

  it('loads a course from the backup when the API is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const { course } = await fetchCourse('77');
    expect(course.name).toBe('Steele Canyon Golf Club');
    expect(course.holes).toHaveLength(18);
  });

  it('saves every course picked from the API', async () => {
    const detail = { id: 77, course_name: 'Steele Canyon Golf Club', holes: 18, holes_data: [] };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => detail })));
    await fetchCourse('77');
    expect(backup.backupCourse).toHaveBeenCalledWith('77', detail);
  });
});
