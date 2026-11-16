// @mentions in comments. Pure helpers, no React or network.
// Usernames are 3–24 of a-z 0-9 _ . (same rule as public_profiles.username,
// and the regex the database uses to send mention notifications).

const MENTION = /(^|[^A-Za-z0-9_.@])@([A-Za-z0-9_.]{3,24})/g;

// Split text into plain parts and mentions, for rendering links.
// [{ text } | { mention: 'username', text: '@username' }]
export function splitMentions(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    const at = m.index + m[1].length;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ mention: m[2].toLowerCase(), text: `@${m[2]}` });
    last = at + 1 + m[2].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

// Is the caret right after "@something" being typed? { start, query } or null.
export function activeMention(text, caret = text.length) {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([A-Za-z0-9_.]{0,24})$/.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

// Replace the "@query" being typed with "@username " and return the new
// text and caret position.
export function insertMention(text, caret, username) {
  const active = activeMention(text, caret);
  if (!active) return { text, caret };
  const insert = `@${username} `;
  const after = text.slice(caret).replace(/^\S*/, '').replace(/^ /, '');
  const next = text.slice(0, active.start) + insert + after;
  return { text: next, caret: active.start + insert.length };
}
