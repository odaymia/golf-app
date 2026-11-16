// Golfers you've played rounds with, remembered on this phone per account,
// so you can add your usual group even with no signal. Newest first.
// [{ id (their user id), name, username, avatarUrl, index }]
const key = (meId) => `golf-app:recent-golfers:${meId}`;
const MAX = 30;

export function listRecentGolfers(meId, storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage.getItem(key(meId)) ?? '[]');
    return Array.isArray(list) ? list.filter((g) => g && g.id && g.name) : [];
  } catch {
    return [];
  }
}

export function rememberGolfers(meId, golfers, storage = globalThis.localStorage) {
  const fresh = golfers.filter((g) => g?.id && g.id !== meId).map(({ id, name, username = '', avatarUrl = null, index = null }) => ({ id, name, username, avatarUrl, index }));
  const list = [...fresh, ...listRecentGolfers(meId, storage).filter((g) => !fresh.some((f) => f.id === g.id))].slice(0, MAX);
  try {
    storage.setItem(key(meId), JSON.stringify(list));
  } catch {
    // storage full or blocked
  }
  return list;
}
