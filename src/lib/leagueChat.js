// Tournament / league chat (supabase/league_chat.sql). The only code that
// touches league_chat. The database hides messages between blocked people
// and only lets members of the league read or post.
import { supabase } from './supabase.js';
import { call } from './social.js';

const toMsg = (r) => ({ id: r.id, userId: r.user_id, body: r.body, createdAt: r.created_at });

// The latest messages, oldest first (the last `limit`).
export async function listChat(leagueId, limit = 200) {
  const rows = await call(
    supabase
      .from('league_chat')
      .select('id, user_id, body, created_at')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
  return rows.map(toMsg).reverse();
}

// Newest message (for the unread dot), or null.
export async function latestChat(leagueId) {
  const rows = await call(
    supabase.from('league_chat').select('id, user_id, body, created_at').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(1),
  );
  return rows[0] ? toMsg(rows[0]) : null;
}

export async function sendChat(leagueId, body) {
  const text = body.trim().slice(0, 500);
  if (!text) return null;
  const row = await call(supabase.from('league_chat').insert({ league_id: leagueId, body: text }).select('id, user_id, body, created_at').single());
  return toMsg(row);
}

export function deleteChat(id) {
  return call(supabase.from('league_chat').delete().eq('id', id));
}

export function reportChat(leagueId, msg) {
  return call(
    supabase.from('league_chat_reports').insert({ league_id: leagueId, message_id: msg.id, reported_user: msg.userId, body: msg.body }),
  );
}

// When I last opened this league's chat (this phone).
const seenKey = (leagueId) => `scribble:chat-seen:${leagueId}`;
export function chatSeenAt(leagueId) {
  try {
    return localStorage.getItem(seenKey(leagueId)) ?? '';
  } catch {
    return '';
  }
}
export function markChatSeen(leagueId, at = new Date().toISOString()) {
  try {
    if (at > chatSeenAt(leagueId)) localStorage.setItem(seenKey(leagueId), at);
  } catch {
    // storage blocked: the dot just comes back
  }
}

// Unread = someone else's message newer than my last visit.
export const isUnread = (latest, meUserId, seenAt) => !!latest && latest.userId !== meUserId && latest.createdAt > (seenAt || '');
