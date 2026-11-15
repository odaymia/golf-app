import { useCallback, useEffect, useState } from 'react';
import { follow, listFollows, removeFollower, unfollow } from '../../lib/social.js';
import Avatar from './Avatar.jsx';

// A profile's Followers and Following, with a search box and Follow buttons.
// On your own Followers list you can also remove someone.
export default function FollowList({ userId, username, kind: initialKind = 'followers', meId, nav, back }) {
  const [kind, setKind] = useState(initialKind);
  const [lists, setLists] = useState({});
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const mine = userId === meId;

  const load = useCallback(
    (k) =>
      listFollows(userId, k, meId)
        .then((items) => setLists((l) => ({ ...l, [k]: items })))
        .catch((e) => {
          setError(e.message);
          setLists((l) => ({ ...l, [k]: [] }));
        }),
    [userId, meId],
  );

  useEffect(() => {
    load('followers');
    load('following');
  }, [load]);

  const setState = (id, followState) =>
    setLists((l) => Object.fromEntries(Object.entries(l).map(([k, items]) => [k, items.map((x) => (x.id === id ? { ...x, followState } : x))])));

  async function toggle(p) {
    setError('');
    try {
      if (p.followState === 'none') setState(p.id, await follow(p.id));
      else {
        if (p.followState === 'following' && p.profile.isPrivate && !confirm(`Unfollow @${p.profile.username}? You'll need to ask again to see their posts.`)) return;
        await unfollow(meId, p.id);
        setState(p.id, 'none');
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(p) {
    if (!confirm(`Remove @${p.profile.username || 'this golfer'} from your followers? They won’t be told.`)) return;
    try {
      await removeFollower(meId, p.id);
      setLists((l) => ({ ...l, followers: l.followers.filter((x) => x.id !== p.id) }));
    } catch (e) {
      setError(e.message);
    }
  }

  const items = lists[kind];
  const t = q.trim().toLowerCase();
  const shown = (items ?? []).filter((p) => !t || `${p.profile.username} ${p.profile.displayName}`.toLowerCase().includes(t));

  return (
    <div className="screen follow-list">
      <header className="fl-head">
        <div className="fl-bar">
          <button className="fl-back" onClick={back} aria-label="Back">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1>{username || 'Profile'}</h1>
          <span />
        </div>
        <div className="fl-tabs" role="tablist" style={{ '--tab': kind === 'followers' ? 0 : 1 }}>
          {[
            ['followers', 'Followers'],
            ['following', 'Following'],
          ].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {lists[k] && <b>{lists[k].length}</b>} {label}
            </button>
          ))}
          <i className="fl-ink" aria-hidden="true" />
        </div>
        <label className="fl-search">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search this list" />
        </label>
      </header>
      {error && <div className="card warn-box">{error}</div>}
      {items === undefined && (
        <ul className="follow-rows" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="fl-skeleton">
              <span className="fl-sk-avatar" />
              <span className="fl-sk-lines">
                <i />
                <i />
              </span>
            </li>
          ))}
        </ul>
      )}
      {items && shown.length === 0 && (
        <p className="fl-empty">
          {t ? 'No one matches.' : kind === 'followers' ? 'No followers yet.' : mine ? 'You’re not following anyone yet.' : 'Not following anyone yet.'}
        </p>
      )}
      <ul className="follow-rows">
        {shown.map((p) => (
          <li key={p.id}>
            <button className="follow-who" onClick={() => nav('user', { userId: p.id })}>
              <Avatar profile={p.profile} size={52} />
              <span>
                <strong>
                  {p.profile.username || p.profile.displayName}
                  {p.profile.isPrivate && <span className="lock-mark"> 🔒</span>}
                </strong>
                {p.profile.username && p.profile.displayName && <em>{p.profile.displayName}</em>}
              </span>
            </button>
            {mine && kind === 'followers' ? (
              <button className="fl-btn soft" onClick={() => remove(p)}>
                Remove
              </button>
            ) : p.followState !== 'me' ? (
              <button className={`fl-btn ${p.followState === 'none' ? 'solid' : 'soft'}`} onClick={() => toggle(p)}>
                {p.followState === 'following' ? 'Following' : p.followState === 'pending' ? 'Requested' : 'Follow'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
