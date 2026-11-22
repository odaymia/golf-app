import { useCallback, useEffect, useState } from 'react';
import { deleteNotification, groupByTime, listNotifications, markAllRead, notificationText, notificationsChanged } from '../../lib/notifications.js';
import { timeAgo } from '../../lib/socialFormat.js';
import Avatar from './Avatar.jsx';
import { acceptFollower, listFollowRequests, removeFollower } from '../../lib/social.js';

// Likes, comments, follows, messages and swing reviews, newest first.
// Opening the screen marks everything read (the dots stay until you leave).
export default function Notifications({ meId, nav, back }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState([]);

  const load = useCallback(async () => {
    try {
      const [items, reqs] = await Promise.all([listNotifications(meId), listFollowRequests(meId)]);
      setRequests(reqs);
      // Requests are answered in their own section above.
      setList(items.filter((n) => n.type !== 'follow_request'));
      setError('');
      if (items.some((n) => !n.read)) {
        await markAllRead(meId);
        notificationsChanged();
      }
    } catch (e) {
      setError(e.message);
      setList((l) => l ?? []);
    }
  }, [meId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  function open(n) {
    if (n.type === 'message') return nav('thread', { conversationId: n.conversationId, peer: n.actor });
    if (n.type === 'follow') return nav('user', { userId: n.actor.id });
    if (n.type === 'review_request') return nav('studio');
    if (n.type === 'review_answer') return nav('user', { userId: n.actor.id });
    if (n.postId) return nav('post', { postId: n.postId });
    return nav('user', { userId: n.actor.id });
  }

  async function answer(r, accept) {
    setRequests((list) => list.filter((x) => x.userId !== r.userId));
    try {
      if (accept) await acceptFollower(meId, r.userId);
      else await removeFollower(meId, r.userId);
      load();
    } catch (e) {
      setError(e.message);
      load();
    }
  }

  async function remove(n) {
    setList((l) => l.filter((x) => x.id !== n.id));
    try {
      await deleteNotification(n.id);
    } catch {
      load();
    }
  }

  return (
    <div className="screen notifications">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={back}>
          ‹ Back
        </button>
        <h1>Notifications</h1>
        <span />
      </div>
      {error && <div className="card warn-box">{error}</div>}
      {requests.length > 0 && (
        <section className="notif-group">
          <h3 className="notif-h">Follow requests</h3>
          <ul className="notif-list">
            {requests.map((r) => (
              <li key={r.userId} className="unread">
                <button className="notif-avatar" onClick={() => nav('user', { userId: r.userId })} aria-label={r.profile.username}>
                  <Avatar profile={r.profile} size={44} />
                </button>
                <span className="notif-text">
                  <strong>{r.profile.username || r.profile.displayName}</strong> asked to follow you. <em>{timeAgo(r.createdAt)}</em>
                </span>
                <span className="request-actions">
                  <button className="btn btn-primary btn-small" onClick={() => answer(r, true)}>
                    Confirm
                  </button>
                  <button className="btn btn-ghost btn-small" onClick={() => answer(r, false)}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {list === null && <p className="muted center">Loading…</p>}
      {list?.length === 0 && !error && requests.length === 0 && (
        <div className="center empty-inbox">
          <p className="muted">No notifications yet. Likes, comments, follows and messages show up here.</p>
        </div>
      )}
      {list &&
        groupByTime(list).map((g) => (
          <section key={g.key} className="notif-group">
            <h3 className="notif-h">{g.label}</h3>
            <ul className="notif-list">
              {g.items.map((n) => (
                <li key={n.id} className={n.read ? '' : 'unread'}>
                  <button className="notif-avatar" onClick={() => nav('user', { userId: n.actor.id })} aria-label={n.actor.username}>
                    <Avatar profile={n.actor} size={44} />
                  </button>
                  <button className="notif-main" onClick={() => open(n)}>
                    <span className="notif-text">
                      <strong>{n.actor.username || n.actor.displayName}</strong> {notificationText(n)}{' '}
                      <em>{timeAgo(n.createdAt)}</em>
                    </span>
                    {n.thumb ? (
                      <img className="notif-thumb" src={n.thumb} alt="" loading="lazy" />
                    ) : n.type === 'message' ? (
                      <span className="notif-kind" aria-hidden="true">💬</span>
                    ) : n.type === 'league_invite' || n.type === 'round_added' ? (
                      <span className="notif-kind" aria-hidden="true">⛳</span>
                    ) : n.type.startsWith('review') ? (
                      <span className="notif-kind" aria-hidden="true">🎥</span>
                    ) : null}
                  </button>
                  <button className="notif-x" onClick={() => remove(n)} aria-label="Remove notification">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
