// Notifications (supabase/notifications.sql): likes, comments, follows,
// direct messages and swing reviews. Rows are made by database triggers;
// the app only reads them, marks them read and deletes them. The only
// module that touches the notifications table.
import { supabase } from './supabase.js';
import { call, mediaUrl, PREMIUM, signPremium } from './social.js';

const profileOf = (r, id) =>
  r
    ? { id: r.id, username: r.username ?? '', displayName: r.display_name ?? '', avatarUrl: mediaUrl(r.avatar_path) }
    : { id, username: '', displayName: 'Golfer', avatarUrl: null };

// Newest first, with who did it and the post's thumbnail.
// [{ id, type, actor, postId, thumb, conversationId, reviewId, body, count, read, createdAt }]
export async function listNotifications(meId, limit = 100) {
  const rows = await call(
    supabase.from('notifications').select('*').eq('user_id', meId).order('created_at', { ascending: false }).limit(limit),
  );
  if (!rows.length) return [];
  const actorIds = [...new Set(rows.map((r) => r.actor_id))];
  const postIds = [...new Set(rows.map((r) => r.post_id).filter(Boolean))];
  const [actors, media] = await Promise.all([
    call(supabase.from('public_profiles').select('id, username, display_name, avatar_path').in('id', actorIds)),
    postIds.length
      ? call(supabase.from('post_media').select('post_id, kind, path, poster_path, position, bucket').in('post_id', postIds)).catch(() => [])
      : [],
  ]);
  const firstMedia = new Map();
  for (const m of [...media].sort((a, b) => a.position - b.position)) if (!firstMedia.has(m.post_id)) firstMedia.set(m.post_id, m);
  const thumbPath = (m) => (m.kind === 'video' ? m.poster_path : m.path);
  const signed = await signPremium([...firstMedia.values()].filter((m) => m.bucket === PREMIUM).map(thumbPath));
  const thumbOf = (postId) => {
    const m = firstMedia.get(postId);
    if (!m) return null;
    return m.bucket === PREMIUM ? signed.get(thumbPath(m)) ?? null : mediaUrl(thumbPath(m));
  };
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    actor: profileOf(actors.find((a) => a.id === r.actor_id), r.actor_id),
    postId: r.post_id,
    thumb: r.post_id ? thumbOf(r.post_id) : null,
    conversationId: r.conversation_id,
    reviewId: r.review_id,
    body: r.body ?? '',
    count: r.count ?? 1,
    read: !!r.read_at,
    createdAt: r.created_at,
  }));
}

// Tell the badges (bottom tab, profile bell) to recount.
export const NOTIFICATIONS_CHANGED = 'scribble:notifications-changed';
export const notificationsChanged = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

// How many unread. Fails soft to 0 (e.g. notifications.sql not run yet).
export async function unreadNotifications(meId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', meId)
    .is('read_at', null);
  return error ? 0 : count ?? 0;
}

export function markAllRead(meId) {
  return call(supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', meId).is('read_at', null));
}

export function deleteNotification(id) {
  return call(supabase.from('notifications').delete().eq('id', id));
}

// Group by when they happened, like other apps: Today, This week, Earlier.
export function groupByTime(list, now = new Date()) {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startOfDay - 6 * 86400000;
  const groups = [
    { key: 'today', label: 'Today', items: [] },
    { key: 'week', label: 'This week', items: [] },
    { key: 'earlier', label: 'Earlier', items: [] },
  ];
  for (const n of list) {
    const t = new Date(n.createdAt).getTime();
    groups[t >= startOfDay ? 0 : t >= weekAgo ? 1 : 2].items.push(n);
  }
  return groups.filter((g) => g.items.length);
}

// One line of text for a notification (the name is shown separately, bold).
export function notificationText(n) {
  switch (n.type) {
    case 'like':
      return 'liked your post.';
    case 'comment':
      return `commented: ${n.body}`;
    case 'follow':
      return 'started following you.';
    case 'message':
      return n.count > 1 ? `sent you ${n.count} messages: ${n.body}` : `sent you a message: ${n.body}`;
    case 'review_request':
      return n.body ? `sent you a swing to review: “${n.body}”` : 'sent you a swing to review.';
    case 'review_answer':
      return `reviewed your swing: ${n.body}`;
    default:
      return '';
  }
}
