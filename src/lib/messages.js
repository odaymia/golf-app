// Direct messages in Supabase (supabase/saves_messages.sql): conversations,
// their members, and messages (text and/or a shared post). The only module
// that touches those tables. Blocked people are hidden from your inbox, and
// the database refuses messages between them.
import { supabase } from './supabase.js';
import { call, hiddenUserIds, POST_SELECT, toPost, withMyLikes } from './social.js';

const profileOf = (r) =>
  r && {
    id: r.id,
    username: r.username ?? '',
    displayName: r.display_name ?? '',
    avatarUrl: r.avatar_path ? supabase.storage.from('media').getPublicUrl(r.avatar_path).data.publicUrl : null,
  };

// Open (or start) the conversation with one golfer. Returns its id.
export function startDM(userId) {
  return call(supabase.rpc('start_dm', { p_user: userId }));
}

// My inbox, newest first:
// [{ id, other: profile, last: { body, postId, senderId, createdAt } | null, unread }]
export async function listConversations(meId) {
  const mine = await call(supabase.from('conversation_members').select('conversation_id').eq('user_id', meId));
  if (!mine.length) return [];
  const ids = mine.map((m) => m.conversation_id);
  const [convs, members, recent, hidden] = await Promise.all([
    call(supabase.from('conversations').select('id, last_message_at').in('id', ids)),
    call(supabase.from('conversation_members').select('conversation_id, user_id').in('conversation_id', ids).neq('user_id', meId)),
    call(
      supabase
        .from('messages')
        .select('conversation_id, sender_id, body, post_id, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(Math.min(500, ids.length * 20)),
    ),
    hiddenUserIds(meId).catch(() => new Set()),
  ]);
  const times = await readTimes(ids);
  const otherIds = [...new Set(members.map((m) => m.user_id))];
  const profiles = otherIds.length ? await call(supabase.from('public_profiles').select('*').in('id', otherIds)) : [];
  return convs
    .map((c) => {
      const other = members.find((m) => m.conversation_id === c.id);
      const otherId = other?.user_id;
      const last = recent.find((r) => r.conversation_id === c.id) ?? null;
      const readAt = times.get(c.id)?.mine;
      const peerReadAt = times.get(c.id)?.peer;
      return {
        id: c.id,
        otherId,
        other: profileOf(profiles.find((p) => p.id === otherId)) ?? { id: otherId, username: '', displayName: 'Golfer' },
        lastAt: c.last_message_at,
        last: last && { body: last.body, postId: last.post_id, senderId: last.sender_id, createdAt: last.created_at },
        unread: !!last && last.sender_id !== meId && (!readAt || last.created_at > readAt),
        // Read receipt: they've opened the chat since my last message.
        seen: !!last && last.sender_id === meId && !!peerReadAt && peerReadAt >= last.created_at,
      };
    })
    .filter((c) => c.last && otherIds.length && !hidden.has(c.otherId))
    .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
}

export async function unreadCount(meId) {
  const list = await listConversations(meId);
  return list.filter((c) => c.unread).length;
}

// The other person in a conversation.
export async function conversationPeer(conversationId, meId) {
  const rows = await call(
    supabase.from('conversation_members').select('user_id').eq('conversation_id', conversationId).neq('user_id', meId),
  );
  if (!rows.length) return null;
  const p = await call(supabase.from('public_profiles').select('*').eq('id', rows[0].user_id).maybeSingle());
  return profileOf(p) ?? { id: rows[0].user_id, username: '', displayName: 'Golfer' };
}

// Read times per conversation: Map(id -> { mine, peer }). `peer` is only
// given when both people have read receipts on (supabase/read_receipts.sql).
async function readTimes(ids) {
  if (!ids.length) return new Map();
  const rows = await call(supabase.rpc('conversation_read_times', { p_ids: ids })).catch(() => []);
  return new Map((rows ?? []).map((r) => [r.conversation_id, { mine: r.my_read_at, peer: r.peer_read_at }]));
}

// When the other person last opened this chat, or null (not yet, or read
// receipts are off for either of you).
export async function peerReadAt(conversationId) {
  const times = await readTimes([conversationId]);
  return times.get(conversationId)?.peer ?? null;
}

// The latest messages, oldest first, with shared posts attached.
export async function listMessages(conversationId, meId, limit = 100) {
  const rows = await call(
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
  const postIds = [...new Set(rows.map((r) => r.post_id).filter(Boolean))];
  let posts = [];
  if (postIds.length) {
    const prow = await call(supabase.from('posts').select(POST_SELECT).in('id', postIds));
    posts = await withMyLikes(prow.map(toPost), meId);
  }
  return rows.reverse().map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    body: r.body,
    postId: r.post_id,
    post: posts.find((p) => p.id === r.post_id) ?? null,
    createdAt: r.created_at,
  }));
}

export function sendMessage(conversationId, { body = '', postId = null }) {
  return call(supabase.from('messages').insert({ conversation_id: conversationId, body: body.trim().slice(0, 2000), post_id: postId }));
}

// Send a post to golfers (sharing). Returns how many it went to.
export async function sharePost(postId, userIds, note = '') {
  for (const id of userIds) {
    const conv = await startDM(id);
    await sendMessage(conv, { body: note, postId });
  }
  return userIds.length;
}

export function deleteMessage(id) {
  return call(supabase.from('messages').delete().eq('id', id));
}

export function markRead(conversationId, meId) {
  return call(
    supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', meId),
  );
}
