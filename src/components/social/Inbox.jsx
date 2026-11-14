import { useCallback, useEffect, useState } from 'react';
import { listConversations, startDM } from '../../lib/messages.js';
import { searchProfiles } from '../../lib/social.js';
import { timeAgo } from '../../lib/socialFormat.js';
import Avatar from './Avatar.jsx';

// Your direct messages, newest first, and starting a new one.
export default function Inbox({ meId, nav, back }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);

  const load = useCallback(() => {
    listConversations(meId)
      .then((l) => {
        setList(l);
        setError('');
      })
      .catch((e) => {
        setError(e.message);
        setList((l) => l ?? []);
      });
  }, [meId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => searchProfiles(q, meId).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q, meId]);

  async function open(profile) {
    try {
      const id = await startDM(profile.id);
      nav('thread', { conversationId: id, peer: profile });
    } catch (e) {
      setError(e.message);
    }
  }

  const preview = (c) => {
    const who = c.last.senderId === meId ? 'You: ' : '';
    if (c.last.body) return who + c.last.body;
    return c.last.senderId === meId ? 'You sent a post' : 'Sent you a post';
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={back}>
          ‹ Back
        </button>
        <h1>Messages</h1>
        <button className="btn btn-ghost" onClick={() => setComposing((c) => !c)} aria-label="New message">
          {composing ? 'Cancel' : 'New'}
        </button>
      </div>
      {composing && (
        <section className="card">
          <input autoFocus className="share-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search golfers by name or username" />
          <ul className="people-pick">
            {found.map((p) => (
              <li key={p.id}>
                <button onClick={() => open(p)}>
                  <Avatar profile={p} size={40} />
                  <span>
                    <strong>{p.username || p.displayName}</strong>
                    {p.username && p.displayName && <em>{p.displayName}</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {q.trim().length >= 2 && found.length === 0 && <p className="muted small">No golfers found.</p>}
        </section>
      )}
      {error && <div className="card warn-box">{error}</div>}
      {list === null && <p className="muted center">Loading…</p>}
      {list?.length === 0 && !composing && (
        <div className="center empty-inbox">
          <p className="muted">No messages yet.</p>
          <button className="btn btn-primary" onClick={() => setComposing(true)}>
            Send a message
          </button>
        </div>
      )}
      <ul className="inbox">
        {(list ?? []).map((c) => (
          <li key={c.id}>
            <button className={c.unread ? 'unread' : ''} onClick={() => nav('thread', { conversationId: c.id, peer: c.other })}>
              <Avatar profile={c.other} size={48} />
              <span className="inbox-text">
                <strong>{c.other.username || c.other.displayName}</strong>
                <span>
                  {preview(c)} · {timeAgo(c.last.createdAt)}
                </span>
              </span>
              {c.unread && <i className="unread-dot" aria-label="Unread" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
