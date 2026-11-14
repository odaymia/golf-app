import { useRef, useState } from 'react';
import { likePost, unlikePost, deletePost, reportPost } from '../../lib/social.js';
import { countLabel, timeAgo } from '../../lib/socialFormat.js';
import Avatar from './Avatar.jsx';

// One post: author, location, photos/videos (swipe), like, comments, caption.
export default function PostCard({ post, meId, nav, onChanged, onDeleted }) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [slide, setSlide] = useState(0);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  const track = useRef(null);
  const lastTap = useRef(0);
  const mine = post.userId === meId;

  async function toggleLike(force) {
    const next = force ?? !liked;
    if (next === liked) return;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      if (next) await likePost(post.id);
      else await unlikePost(meId, post.id);
      onChanged?.();
    } catch (e) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      setError(e.message);
    }
  }

  // Double-tap a photo to like it.
  function onMediaTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) toggleLike(true);
    lastTap.current = now;
  }

  async function remove() {
    setMenu(false);
    if (!confirm('Delete this post? This can’t be undone.')) return;
    try {
      await deletePost(post);
      onDeleted?.(post.id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function report() {
    setMenu(false);
    const reason = prompt('What’s wrong with this post? (optional)');
    if (reason === null) return;
    try {
      await reportPost(post.id, reason);
      alert('Thanks. We’ll take a look.');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <article className="post-card">
      <header className="post-head">
        <button className="post-author" onClick={() => nav('user', { userId: post.userId })}>
          <Avatar profile={post.author} size={36} />
          <span>
            <strong>{post.author.username || post.author.displayName}</strong>
            {post.course && (
              <span
                className="post-place"
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  if (post.course.key) nav('course', { course: post.course });
                }}
              >
                📍 {post.course.name}
              </span>
            )}
          </span>
        </button>
        <button className="btn btn-ghost btn-small post-more" onClick={() => setMenu((m) => !m)} aria-label="More">
          ⋯
        </button>
        {menu && (
          <div className="post-menu">
            {mine ? (
              <button className="danger" onClick={remove}>
                Delete post
              </button>
            ) : (
              <button onClick={report}>Report post</button>
            )}
            <button onClick={() => setMenu(false)}>Cancel</button>
          </div>
        )}
      </header>

      {post.media.length > 0 && (
        <div className="post-media">
          <div
            className="media-track"
            ref={track}
            onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            {post.media.map((m, i) => (
              <div className="media-slide" key={i} onClick={onMediaTap}>
                {m.kind === 'video' ? (
                  <video src={m.url} poster={m.posterUrl ?? undefined} controls playsInline preload="metadata" />
                ) : (
                  <img src={m.url} alt="" loading="lazy" />
                )}
              </div>
            ))}
          </div>
          {post.media.length > 1 && (
            <div className="media-dots" aria-hidden="true">
              {post.media.map((_, i) => (
                <span key={i} className={i === slide ? 'on' : ''} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="post-actions">
        <button className={`like-btn ${liked ? 'on' : ''}`} onClick={() => toggleLike()} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path
              d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3C14.3 6.1 15.6 5 17.6 5 21 5 22.7 8.4 21.2 11.4 19 15.6 12 20 12 20z"
              fill={liked ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button className="comment-btn" onClick={() => nav('post', { postId: post.id })} aria-label="Comments">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="post-body">
        {likes > 0 && <p className="post-likes">{countLabel(likes, 'like')}</p>}
        {post.caption && (
          <p className="post-caption">
            <strong>{post.author.username}</strong> {post.caption}
          </p>
        )}
        {post.commentCount > 0 && (
          <button className="link post-comments" onClick={() => nav('post', { postId: post.id })}>
            View {countLabel(post.commentCount, 'comment')}
          </button>
        )}
        <p className="post-time">{timeAgo(post.createdAt)}</p>
        {error && <p className="search-error">{error}</p>}
      </div>
    </article>
  );
}
