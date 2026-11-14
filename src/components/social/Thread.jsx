import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { conversationPeer, deleteMessage, listMessages, markRead, sendMessage } from '../../lib/messages.js';
import { timeAgo } from '../../lib/socialFormat.js';
import Avatar from './Avatar.jsx';

// One conversation. New messages show up every few seconds while it's open.
export default function Thread({ conversationId, peer: initialPeer, meId, nav, back }) {
  const [peer, setPeer] = useState(initialPeer ?? null);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null); // my message tapped (to unsend)
  const end = useRef(null);
  const lastId = useRef(null);

  const load = useCallback(async () => {
    try {
      const list = await listMessages(conversationId, meId);
      setMessages(list);
      if (list.at(-1)?.id !== lastId.current) markRead(conversationId, meId).catch(() => {});
    } catch (e) {
      setError(e.message);
      setMessages((m) => m ?? []);
    }
  }, [conversationId, meId]);

  useEffect(() => {
    if (!initialPeer) conversationPeer(conversationId, meId).then(setPeer).catch(() => {});
  }, [conversationId, meId, initialPeer]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  // Keep the newest message in view when one arrives.
  useLayoutEffect(() => {
    const last = messages?.at(-1)?.id ?? null;
    if (last && last !== lastId.current) end.current?.scrollIntoView({ block: 'end' });
    lastId.current = last;
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await sendMessage(conversationId, { body: text });
      setText('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(m) {
    if (!confirm('Unsend this message? It’s removed for both of you.')) return;
    try {
      await deleteMessage(m.id);
      setMessages((list) => list.filter((x) => x.id !== m.id));
    } catch (err) {
      setError(err.message);
    }
  }

  const name = peer ? peer.username || peer.displayName : '';

  return (
    <div className="screen thread">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={back}>
          ‹ Back
        </button>
        <button className="thread-peer" onClick={() => peer && nav('user', { userId: peer.id })} disabled={!peer}>
          {peer && <Avatar profile={peer} size={28} />}
          <h1>{name}</h1>
        </button>
        <span />
      </div>
      {messages === null && <p className="muted center">Loading…</p>}
      {messages?.length === 0 && <p className="muted center">Say hi to {name || 'them'}.</p>}
      <ul className="bubbles">
        {(messages ?? []).map((m, i) => {
          const mine = m.senderId === meId;
          const gap = i === 0 || new Date(m.createdAt) - new Date(messages[i - 1].createdAt) > 30 * 60 * 1000;
          return (
            <li key={m.id} className={mine ? 'mine' : ''}>
              {gap && <span className="bubble-time">{timeAgo(m.createdAt)}</span>}
              {m.postId && <SharedPost post={m.post} nav={nav} />}
              {m.body && (
                <p className="bubble" onClick={mine ? () => setPicked((x) => (x === m.id ? null : m.id)) : undefined}>
                  {m.body}
                </p>
              )}
              {mine && picked === m.id && (
                <button className="link small-link unsend" onClick={() => remove(m)}>
                  Unsend
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div ref={end} />
      {error && <p className="search-error center">{error}</p>}
      <form className="thread-compose" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" maxLength={2000} />
        <button className="btn btn-primary" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

// A post sent in a message: its first photo, author and caption.
function SharedPost({ post, nav }) {
  if (!post) return <p className="bubble shared-gone">Post unavailable</p>;
  const m = post.media[0];
  const src = m ? (m.kind === 'video' ? m.posterUrl : m.url) : null;
  return (
    <button className="shared-post" onClick={() => nav('post', { postId: post.id })}>
      <span className="shared-author">
        <Avatar profile={post.author} size={22} />
        <strong>{post.author.username || post.author.displayName}</strong>
      </span>
      {src && (
        <span className="shared-media">
          <img src={src} alt="" loading="lazy" />
          {m.kind === 'video' && <i>▶</i>}
        </span>
      )}
      {post.caption && <span className="shared-caption">{post.caption}</span>}
    </button>
  );
}
