import { describe, it, expect } from 'vitest';
import { cumulative, fillDays, fillWeeks, retentionPct, statsCsv, stickiness, weekOf, weekOverWeek } from './metrics.js';

describe('owner dashboard metrics', () => {
  it('finds the Monday of a week', () => {
    expect(weekOf('2026-11-22')).toBe('2026-11-16'); // Sunday -> Monday before
    expect(weekOf('2026-11-16')).toBe('2026-11-16');
    expect(weekOf('2026-11-18')).toBe('2026-11-16');
  });

  it('fills missing weeks and days with zeros', () => {
    expect(fillWeeks([{ week: '2026-11-09', n: 3 }], '2026-11-16', 3)).toEqual([
      { x: '2026-11-02', y: 0 },
      { x: '2026-11-09', y: 3 },
      { x: '2026-11-16', y: 0 },
    ]);
    expect(fillDays([{ day: '2026-11-21', n: 5 }], '2026-11-22', 2)).toEqual([
      { x: '2026-11-21', y: 5 },
      { x: '2026-11-22', y: 0 },
    ]);
  });

  it('running totals, stickiness, week over week, retention', () => {
    expect(cumulative([{ x: 'a', y: 2 }, { x: 'b', y: 3 }], 10).map((p) => p.y)).toEqual([12, 15]);
    expect(stickiness(5, 20)).toBe(25);
    expect(stickiness(5, 0)).toBe(null);
    expect(weekOverWeek([{ y: 10 }, { y: 15 }])).toBe(50);
    expect(weekOverWeek([{ y: 0 }, { y: 4 }])).toBe(null);
    const cohort = { size: 8, back: [4, 2] };
    expect(retentionPct(cohort, 0)).toBe(50);
    expect(retentionPct(cohort, 1)).toBe(25);
    expect(retentionPct(cohort, 2)).toBe(null); // not reached yet
  });

  it('exports CSV with headline numbers and weekly rows', () => {
    const csv = statsCsv({
      generated_at: '2026-11-22T10:00:00Z',
      users: 120,
      users_7d: 9,
      users_30d: 40,
      dau: 15,
      wau: 50,
      mau: 80,
      totals: { leagues: 3, tournaments: 2, posts: 7 },
      signups_weekly: [{ week: '2026-11-16', n: 9 }],
      active_weekly: [{ week: '2026-11-16', n: 50 }],
      activity_weekly: [{ week: '2026-11-16', casual_rounds: 4, league_cards: 30, posts: 2, likes: 10, comments: 3, messages: 12 }],
    });
    expect(csv).toContain('Total users,120');
    expect(csv).toContain('Stickiness (DAU/MAU %),19');
    expect(csv.split('\n').at(-1)).toBe('2026-11-16,9,50,4,30,2,10,3,12');
  });
});
