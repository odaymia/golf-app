// Recent searches, kept on this device per account (private, works offline).
// An entry is a typed search, or a profile/course opened from search:
//   { type: 'query', q } | { type: 'profile', profile } | { type: 'course', course }
// Newest first, no duplicates, at most MAX.

export const MAX_RECENT = 20;
const key = (userId) => `golf-app:search:${userId}`;

export const entryId = (e) =>
  e.type === 'query' ? `q:${e.q.trim().toLowerCase()}` : e.type === 'profile' ? `p:${e.profile.id}` : `c:${e.course.key}`;

export function listRecent(userId, storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage.getItem(key(userId)) ?? '[]');
    return Array.isArray(list) ? list.filter((e) => e && ['query', 'profile', 'course'].includes(e.type)) : [];
  } catch {
    return [];
  }
}

function write(userId, list, storage) {
  try {
    storage.setItem(key(userId), JSON.stringify(list));
  } catch {
    // storage full or blocked: history just isn't kept
  }
  return list;
}

export function addRecent(userId, entry, storage = globalThis.localStorage) {
  if (entry.type === 'query' && !entry.q?.trim()) return listRecent(userId, storage);
  const clean = entry.type === 'query' ? { type: 'query', q: entry.q.trim() } : entry;
  const id = entryId(clean);
  const list = [clean, ...listRecent(userId, storage).filter((e) => entryId(e) !== id)].slice(0, MAX_RECENT);
  return write(userId, list, storage);
}

export function removeRecent(userId, entry, storage = globalThis.localStorage) {
  const id = entryId(entry);
  return write(userId, listRecent(userId, storage).filter((e) => entryId(e) !== id), storage);
}

export function clearRecent(userId, storage = globalThis.localStorage) {
  try {
    storage.removeItem(key(userId));
  } catch {
    // nothing to clear
  }
  return [];
}

// Rank posts for a search: tagged at a matching course first, then a
// caption match, then posts by matching people; newest first within each.
export function rankPosts(posts, q, matchedUserIds = new Set()) {
  const t = q.trim().toLowerCase();
  const score = (p) => {
    const course = `${p.course?.name ?? ''} ${p.course?.place ?? ''}`.toLowerCase();
    if (t && course.includes(t)) return 0;
    if (t && p.caption.toLowerCase().includes(t)) return 1;
    if (matchedUserIds.has(p.userId)) return 2;
    return 3;
  };
  return posts
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s < 3)
    .sort((a, b) => a.s - b.s || (b.p.createdAt ?? '').localeCompare(a.p.createdAt ?? ''))
    .map((x) => x.p);
}
