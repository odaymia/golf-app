import { useCallback, useEffect, useState } from 'react';
import { listFeed } from '../../lib/social.js';
import { unreadCount } from '../../lib/messages.js';
import PostCard from './PostCard.jsx';
import { useUnreadNotifications } from '../useUnreadNotifications.js';

// The feed: everyone's posts ("For you") or people you follow, under a
// slim pinned bar (logo; search, notifications, messages).
export default function Feed({ meId, nav }) {
  const [mode, setMode] = useState('all');
  const [posts, setPosts] = useState(null);
  const [more, setMore] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const alerts = useUnreadNotifications(meId);

  // Unread conversations, for the badge on the messages button.
  useEffect(() => {
    const check = () => unreadCount(meId).then(setUnread).catch(() => {});
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [meId]);

  const load = useCallback(
    async (reset) => {
      setLoading(true);
      setError('');
      try {
        const before = reset ? null : posts?.at(-1)?.createdAt;
        const page = await listFeed({ meId, mode, before, limit: 10 });
        setPosts((prev) => (reset || !prev ? page : [...prev, ...page]));
        setMore(page.length === 10);
      } catch (e) {
        setError(e.message);
        if (reset) setPosts([]);
      } finally {
        setLoading(false);
      }
    },
    [meId, mode, posts],
  );

  useEffect(() => {
    setPosts(null);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the tab changes
  }, [mode, meId]);

  return (
    <div className="screen feed-screen">
      <header className="feed-bar">
        <div className="feed-bar-row">
          <img className="feed-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Scribble Golf Club" />
          <div className="feed-icons">
            <button className="feed-icon" onClick={() => nav('search')} aria-label="Search golfers, courses, posts">
              <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.9" />
                <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            </button>
            <button className="feed-icon" onClick={() => nav('activity')} aria-label={alerts ? `Notifications, ${alerts} new` : 'Notifications'}>
              <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">
                <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
              {alerts > 0 && <span className="inbox-badge">{alerts > 9 ? '9+' : alerts}</span>}
            </button>
            <button className="feed-icon" onClick={() => nav('inbox')} aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}>
              <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">
                <path d="M21 3 3 10.5l7 2.5 2.5 7z M21 3 10 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
              {unread > 0 && <span className="inbox-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
          </div>
        </div>
        <div className="feed-tabs" role="tablist">
          {[
            ['all', 'For you'],
            ['following', 'Following'],
          ].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      {error && <div className="card warn-box">{error}</div>}
      {posts === null && <p className="muted center">Loading…</p>}
      {posts?.length === 0 && !error && (
        <div className="card empty-feed">
          <h3>{mode === 'following' ? 'Nothing from people you follow yet' : 'No posts yet'}</h3>
          <p className="muted">
            {mode === 'following'
              ? 'Follow golfers from their profiles, or check For you.'
              : 'Be the first: tap + to share a photo or video from your round.'}
          </p>
          <button className="btn btn-primary" onClick={() => nav('new')}>
            Share a post
          </button>
        </div>
      )}
      {posts?.map((p) => (
        <PostCard key={p.id} post={p} meId={meId} nav={nav} onDeleted={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} />
      ))}
      {posts?.length > 0 && more && (
        <button className="btn btn-ghost btn-xl" onClick={() => load(false)} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
