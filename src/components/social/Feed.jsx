import { useCallback, useEffect, useState } from 'react';
import { listFeed } from '../../lib/social.js';
import { unreadCount } from '../../lib/messages.js';
import PostCard from './PostCard.jsx';

// The feed: everyone's posts ("For you") or people you follow.
export default function Feed({ meId, nav }) {
  const [mode, setMode] = useState('all');
  const [posts, setPosts] = useState(null);
  const [more, setMore] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);

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
      <div className="feed-top">
        <img className="feed-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Scribble Golf Club" />
        <button className="inbox-btn" onClick={() => nav('inbox')} aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M21 3 3 10.5l7 2.5 2.5 7z M21 3 10 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          {unread > 0 && <span className="inbox-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </div>
      <div className="tabs wide-tabs" role="tablist">
        {[
          ['all', 'For you'],
          ['following', 'Following'],
        ].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
            {label}
          </button>
        ))}
      </div>
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
