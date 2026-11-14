// Pure helpers for the social feed. No network, no DOM.

// 3-24 characters: lowercase letters, numbers, dots and underscores.
export function cleanUsername(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_.]/g, '');
}

export function usernameProblem(name) {
  if (!name) return 'Pick a username.';
  if (name.length < 3) return 'Usernames need at least 3 characters.';
  if (name.length > 24) return 'Usernames can be at most 24 characters.';
  if (!/^[a-z0-9_.]+$/.test(name)) return 'Use letters, numbers, dots and underscores only.';
  return null;
}

// A starting suggestion from someone's name: "Omar Daymia" -> "omardaymia".
export function suggestUsername(displayName) {
  const base = cleanUsername(String(displayName ?? '').replace(/\s+/g, ''));
  return base.length >= 3 ? base.slice(0, 24) : `${base || 'golfer'}${Math.floor(Math.random() * 900 + 100)}`;
}

// "just now", "5m", "3h", "2d", "4w", then a date.
export function timeAgo(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  if (d < 35) return `${Math.floor(d / 7)}w`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Location tag for a course. Searched courses share an id across every
// phone ("oga-<id>"), so their posts gather on one course page.
export function courseTag(course) {
  if (!course) return null;
  return {
    key: course.id ?? null,
    name: course.name ?? '',
    place: course.place ?? '',
  };
}

export function countLabel(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// Compact counts for profile headers: 999, 1.2K, 12K, 1.3M.
export function compactCount(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (n < 1000000) return `${Math.floor(n / 1000)}K`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

// Media path inside the "media" bucket: <userId>/<postId>/<n>.<ext>
export function mediaPath(userId, postId, index, ext) {
  return `${userId}/${postId}/${index}.${ext}`;
}

export const MAX_MEDIA = 10;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
