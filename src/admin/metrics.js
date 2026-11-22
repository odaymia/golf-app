// Pure helpers for the owner dashboard: fill gaps, running totals, ratios,
// CSV. No React, no network.

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Monday of the week containing `iso` (matches Postgres date_trunc('week')).
export function weekOf(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return addDays(iso, -dow);
}

// [{ week, n }] -> one row per week for the `count` weeks ending at `lastWeek`, zeros filled.
export function fillWeeks(rows, lastWeek, count, key = 'n') {
  const byWeek = new Map((rows ?? []).map((r) => [r.week, r[key] ?? 0]));
  return Array.from({ length: count }, (_, i) => {
    const week = addDays(lastWeek, -7 * (count - 1 - i));
    return { x: week, y: Number(byWeek.get(week) ?? 0) };
  });
}

// [{ day, n }] -> one row per day for the `count` days ending at `lastDay`.
export function fillDays(rows, lastDay, count) {
  const byDay = new Map((rows ?? []).map((r) => [r.day, r.n]));
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(lastDay, -(count - 1 - i));
    return { x: day, y: Number(byDay.get(day) ?? 0) };
  });
}

// Weekly sign-ups -> total users at the end of each week.
export function cumulative(points, start = 0) {
  let t = start;
  return points.map((p) => ({ x: p.x, y: (t += p.y) }));
}

// DAU / MAU as a whole percent ("stickiness"), or null with no monthly users.
export const stickiness = (dau, mau) => (mau > 0 ? Math.round((dau / mau) * 100) : null);

// Change between the last two points, as a percent, or null.
export function weekOverWeek(points) {
  if (points.length < 2) return null;
  const [a, b] = [points.at(-2).y, points.at(-1).y];
  if (a === 0) return b === 0 ? 0 : null;
  return Math.round(((b - a) / a) * 100);
}

// Retention cell: % of the cohort back in week k (null when not reached yet).
export const retentionPct = (cohort, k) => {
  const back = cohort.back ?? [];
  if (k >= back.length || !cohort.size) return null;
  return Math.round((back[k] / cohort.size) * 100);
};

// "Nov 17" for a date string.
export const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// The headline numbers and weekly series as CSV (for a deck or spreadsheet).
export function statsCsv(stats) {
  const t = stats.totals ?? {};
  const rows = [
    ['Metric', 'Value'],
    ['Generated', stats.generated_at],
    ['Total users', stats.users],
    ['New users, last 7 days', stats.users_7d],
    ['New users, last 30 days', stats.users_30d],
    ['Daily active users (today)', stats.dau],
    ['Weekly active users', stats.wau],
    ['Monthly active users', stats.mau],
    ['Stickiness (DAU/MAU %)', stickiness(stats.dau, stats.mau) ?? ''],
    ['Leagues', t.leagues],
    ['Tournaments', t.tournaments],
    ['League/tournament rounds', t.league_rounds],
    ['Casual rounds', t.casual_rounds],
    ['Score cards', t.score_cards],
    ['Players in leagues/tournaments', t.players_in_leagues],
    ['Posts', t.posts],
    ['Likes', t.likes],
    ['Comments', t.comments],
    ['Messages', t.messages],
    [],
    ['Week', 'New users', 'Weekly active', 'Casual rounds', 'League cards', 'Posts', 'Likes', 'Comments', 'Messages'],
  ];
  const signups = new Map((stats.signups_weekly ?? []).map((r) => [r.week, r.n]));
  const active = new Map((stats.active_weekly ?? []).map((r) => [r.week, r.n]));
  for (const w of stats.activity_weekly ?? []) {
    rows.push([w.week, signups.get(w.week) ?? 0, active.get(w.week) ?? 0, w.casual_rounds, w.league_cards, w.posts, w.likes, w.comments, w.messages]);
  }
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

// --- Users table ---------------------------------------------------------------

// Search by name, username or email (case-insensitive).
export function filterUsers(list, q) {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  return list.filter((u) => [u.name, u.username, u.email].some((v) => (v ?? '').toLowerCase().includes(s)));
}

// Sort by a column; empty values always go last.
export function sortUsers(list, key, dir = 'desc') {
  const val = (u) => {
    const v = u[key];
    if (v == null || v === '') return null;
    return typeof v === 'number' ? v : String(v).toLowerCase();
  };
  return [...list].sort((a, b) => {
    const [x, y] = [val(a), val(b)];
    if (x === y) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : 1) * (dir === 'asc' ? 1 : -1);
  });
}

export function usersCsv(list) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['Name', 'Username', 'Email', 'Joined', 'Last opened', 'Active days (30)', 'Leagues/tournaments']];
  for (const u of list) rows.push([u.name, u.username, u.email, (u.joined ?? '').slice(0, 10), u.last_seen ?? '', u.active_days_30 ?? 0, u.leagues ?? 0]);
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}
