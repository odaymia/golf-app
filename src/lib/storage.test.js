import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { saveRound, getRound, listRounds, deleteRound, saveCourse, listCourses } from './storage.js';

describe('storage', () => {
  it('saves, loads, lists and deletes rounds', async () => {
    await saveRound({ id: 'r1', course: { name: 'One' }, updatedAt: 0 });
    await new Promise((r) => setTimeout(r, 5));
    await saveRound({ id: 'r2', course: { name: 'Two' }, skip: undefined });
    expect((await getRound('r1')).course.name).toBe('One');
    expect((await listRounds()).map((r) => r.id)).toEqual(['r2', 'r1']);
    await deleteRound('r1');
    expect(await getRound('r1')).toBeUndefined();
  });

  it('saves courses', async () => {
    await saveCourse({ id: 'c1', name: 'Pebble', holes: [] });
    expect((await listCourses()).map((c) => c.name)).toEqual(['Pebble']);
  });
});
