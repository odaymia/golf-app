import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { chatSeenAt, deleteChat, isUnread, latestChat, listChat, markChatSeen, reportChat, sendChat } from '../lib/leagueChat.js';
import { blockUser } from '../lib/social.js';
import { timeAgo } from '../lib/socialFormat.js';

// The tournament / league chat room, full screen over the round (so the
// scores you're entering stay put). Everyone in the league can read and
// post; new messages show up every few seconds while it's open.
// people: data.people (everyone in the league, for names); me: my member row.
export default function LeagueChat({ leagueId, title, people, me, isAdmin, onClose }) {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null);
  const end = useRef(null);
  const lastId = useRef(null);
  const meUser = me?.userId ?? null;

  const load = useCallback(async () => {
    try {
      const list = await listChat(leagueId);
      setMessages(list);
      setError('');
      if (list.length) markChatSeen(leagueId, list.at(-1).createdAt);
    } catch (e) {
      setError(e.message);
      setMessages((m) => m ?? []);
    }
  }, [leagueId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useLayoutEffect(() => {
    const last = messages?.at(-1)?.id ?? null;
    if (last && last !== lastId.current) end.current?.scrollIntoView({ block: 'end' });
    lastId.current = last;
  }, [messages]);

  const nameOf = (userId) => people.find((p) => p.userId === userId)?.name ?? 'Golfer';

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const m = await sendChat(leagueId, text);
      setText('');
      if (m) setMessages((list) => [...(list ?? []), m]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(kind, m) {
    setPicked(null);
    try {
      if (kind === 'delete') {
        if (!confirm(m.userId === meUser ? 'Delete your message?' : 'Delete this message for everyone?')) return;
        await deleteChat(m.id);
        setMessages((list) => list.filter((x) => x.id !== m.id));
      } else if (kind === 'report') {
        if (!confirm('Report this message to Scribble?')) return;
        await reportChat(leagueId, m);
        alert('Thanks. We review reports within 24 hours.');
      } else if (kind === 'block') {
        if (!confirm(`Block ${nameOf(m.userId)}? You won’t see each other’s messages or posts.`)) return;
        await blockUser(m.userId);
        await load();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="chat-sheet" role="dialog" aria-label="Chat">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onClose}>
          ‹ Back
        </button>
        <h1>Chat</h1>
        <span />
      </div>
      <p className="muted center small chat-sub">{title} · everyone in it can read this</p>
      <div className="chat-scroll">
        {messages === null && <p className="muted center">Loading…</p>}
        {messages?.length === 0 && !error && <p className="muted center">No messages yet. Start the chirping.</p>}
        <ul className="bubbles">
          {(messages ?? []).map((m, i) => {
            const mine = m.userId === meUser;
            const prev = messages[i - 1];
            const gap = !prev || new Date(m.createdAt) - new Date(prev.createdAt) > 30 * 60 * 1000;
            const showName = !mine && (gap || prev.userId !== m.userId);
            return (
              <li key={m.id} className={mine ? 'mine' : ''}>
                {gap && <span className="bubble-time">{timeAgo(m.createdAt)}</span>}
                {showName && <span className="chat-name">{nameOf(m.userId)}</span>}
                <p className="bubble" onClick={() => setPicked((x) => (x === m.id ? null : m.id))}>
                  {m.body}
                </p>
                {picked === m.id && (
                  <span className="chat-actions">
                    {(mine || isAdmin) && (
                      <button className="link small-link" onClick={() => act('delete', m)}>
                        Delete
                      </button>
                    )}
                    {!mine && (
                      <>
                        <button className="link small-link" onClick={() => act('report', m)}>
                          Report
                        </button>
                        <button className="link small-link" onClick={() => act('block', m)}>
                          Block
                        </button>
                      </>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <div ref={end} />
      </div>
      {error && <p className="search-error center">{error}</p>}
      <form className="chat-compose" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message everyone…" maxLength={500} enterKeyHint="send" />
        <button className="btn btn-primary" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

// Is there a chat message I haven't seen? Checks every 20 s (not while the
// chat is open). Fails quietly (e.g. before league_chat.sql is run).
export function useChatUnread(leagueId, meUserId, open) {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    if (!leagueId || open) {
      setUnread(false);
      return undefined;
    }
    let live = true;
    const check = () =>
      latestChat(leagueId)
        .then((m) => live && setUnread(isUnread(m, meUserId, chatSeenAt(leagueId))))
        .catch(() => {});
    check();
    const t = setInterval(check, 20000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [leagueId, meUserId, open]);
  return unread;
}

// The "Chat" button for a top bar, with a dot for unread messages.
export function ChatButton({ unread, onClick }) {
  return (
    <button className="btn btn-ghost chat-btn" onClick={onClick} aria-label={unread ? 'Chat, new messages' : 'Chat'}>
      Chat
      {unread && <i className="chat-dot" aria-hidden="true" />}
    </button>
  );
}
