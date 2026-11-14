import { useEffect, useState } from 'react';
import { postLink, searchProfiles } from '../../lib/social.js';
import { listConversations, sharePost } from '../../lib/messages.js';
import Avatar from './Avatar.jsx';

// Share a post: send it to golfers in Scribble DMs, or share the link
// anywhere (texts, other apps) or copy it.
export default function ShareSheet({ post, meId, onClose }) {
  const [recent, setRecent] = useState([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [picked, setPicked] = useState([]); // profiles
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    listConversations(meId)
      .then((list) => setRecent(list.map((c) => c.other).slice(0, 12)))
      .catch(() => {});
  }, [meId]);

  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => searchProfiles(q, meId).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q, meId]);

  const people = q.trim().length >= 2 ? found : recent;
  const isPicked = (p) => picked.some((x) => x.id === p.id);
  const toggle = (p) => setPicked((list) => (isPicked(p) ? list.filter((x) => x.id !== p.id) : [...list, p]));
  const link = postLink(post.id);
  const who = post.author.username ? `@${post.author.username}` : 'a golfer';

  async function send() {
    setBusy(true);
    setStatus('');
    try {
      const n = await sharePost(post.id, picked.map((p) => p.id), note);
      setStatus(`Sent to ${n === 1 ? picked[0].username || picked[0].displayName : `${n} golfers`}.`);
      setPicked([]);
      setNote('');
      setTimeout(onClose, 900);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function shareOut() {
    try {
      await navigator.share({ title: 'Scribble Golf Club', text: post.caption ? `${who}: ${post.caption}` : `A post by ${who}`, url: link });
    } catch (e) {
      if (e?.name !== 'AbortError') copy();
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setStatus('Link copied.');
    } catch {
      prompt('Copy this link:', link);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet share-sheet" role="dialog" aria-modal="true" aria-label="Share post" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Share</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
        <input className="share-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search golfers" />
        {people.length === 0 && (
          <p className="muted small">{q.trim().length >= 2 ? 'No golfers found.' : 'Search for a golfer to send this to.'}</p>
        )}
        <ul className="people-pick">
          {people.map((p) => (
            <li key={p.id}>
              <button className={isPicked(p) ? 'on' : ''} onClick={() => toggle(p)} aria-pressed={isPicked(p)}>
                <Avatar profile={p} size={40} />
                <span>
                  <strong>{p.username || p.displayName}</strong>
                  {p.username && p.displayName && <em>{p.displayName}</em>}
                </span>
                <i className="pick-dot" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {picked.length > 0 && (
          <div className="share-send">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a message (optional)" maxLength={500} />
            <button className="btn btn-primary" disabled={busy} onClick={send}>
              {busy ? 'Sending…' : `Send${picked.length > 1 ? ` (${picked.length})` : ''}`}
            </button>
          </div>
        )}
        <div className="share-out">
          {typeof navigator.share === 'function' && (
            <button className="btn btn-ghost outline" onClick={shareOut}>
              Share via…
            </button>
          )}
          <button className="btn btn-ghost outline" onClick={copy}>
            Copy link
          </button>
        </div>
        {status && <p className="share-status">{status}</p>}
      </div>
    </div>
  );
}
