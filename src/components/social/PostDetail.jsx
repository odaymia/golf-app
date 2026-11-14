import { useCallback, useEffect, useState } from 'react';
import { addComment, deleteComment, getPost, listComments } from '../../lib/social.js';
import { timeAgo } from '../../lib/socialFormat.js';
import Avatar from './Avatar.jsx';
import PostCard from './PostCard.jsx';

// One post with its comments.
export default function PostDetail({ postId, meId, nav, back }) {
  const [post, setPost] = useState(undefined);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([getPost(postId, meId), listComments(postId, meId)]);
      setPost(p);
      setComments(c);
    } catch (e) {
      setError(e.message);
      setPost(null);
    }
  }, [postId, meId]);

  useEffect(() => {
    load();
  }, [load]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await addComment(postId, text);
      setText('');
      setComments(await listComments(postId, meId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (!confirm('Delete this comment?')) return;
    try {
      await deleteComment(c.id);
      setComments((cs) => cs.filter((x) => x.id !== c.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={back}>
          ‹ Back
        </button>
        <h1>Post</h1>
        <span />
      </div>
      {post === undefined && <p className="muted center">Loading…</p>}
      {post === null && <div className="card warn-box">{error || 'This post was deleted.'}</div>}
      {post && <PostCard post={post} meId={meId} nav={nav} onDeleted={back} />}
      {post && (
        <section className="card comments">
          <h3>Comments</h3>
          {comments.length === 0 && <p className="muted">No comments yet.</p>}
          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.id}>
                <button className="comment-avatar" onClick={() => nav('user', { userId: c.userId })} aria-label={c.author?.username}>
                  <Avatar profile={c.author} size={30} />
                </button>
                <div>
                  <p>
                    <strong>{c.author?.username}</strong> {c.body}
                  </p>
                  <span className="muted small">
                    {timeAgo(c.createdAt)}
                    {(c.userId === meId || post.userId === meId) && (
                      <button className="link small-link" onClick={() => remove(c)}>
                        Delete
                      </button>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <form className="comment-form" onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" maxLength={1000} />
            <button className="btn btn-primary" disabled={busy || !text.trim()}>
              Post
            </button>
          </form>
          {error && <p className="search-error">{error}</p>}
        </section>
      )}
    </div>
  );
}
