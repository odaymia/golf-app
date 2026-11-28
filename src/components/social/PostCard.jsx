import { useRef, useState } from 'react';
import { likePost, unlikePost, deletePost, reportPost, blockUser, savePost, unsavePost } from '../../lib/social.js';
import { countLabel, timeAgoLong } from '../../lib/socialFormat.js';
import Avatar from './Avatar.jsx';
import FeedVideo from './FeedVideo.jsx';
import ShareSheet from './ShareSheet.jsx';
import FolderSheet from './FolderSheet.jsx';
import { toggleSound } from './feedSound.js';

// Tallest and widest shapes a post box takes (width / height); media
// outside that range is fitted inside without cropping.
const TALLEST = 9 / 16;
const WIDEST = 1.91;
// Captions longer than this start folded, with "more".
const SHORT_CAPTION = 110;

// One post, edge to edge: header (avatar, name, course, ⋯), full-width
// photos/videos (swipe), action row (like, comment, share; save on the
// right), then likes, caption, comments link and time.
export default function PostCard({ post, meId, nav, onChanged, onDeleted }) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [slide, setSlide] = useState(0);
  const [menu, setMenu] = useState(false);
  const [saved, setSaved] = useState(!!post.savedByMe);
  const [toast, setToast] = useState(false);
  const [sheet, setSheet] = useState(null); // 'share' | 'folders'
  const toastTimer = useRef(null);
  const [error, setError] = useState('');
  const [burst, setBurst] = useState(0); // double-tap heart, keyed to replay
  const [open, setOpen] = useState(false); // long caption unfolded
  const track = useRef(null);
  const lastTap = useRef(0);
  // The box takes the first item's shape: from upload, or measured on load.
  const first = post.media[0];
  const [size, setSize] = useState(first?.width && first?.height ? [first.width, first.height] : null);
  const ratio = size ? Math.min(WIDEST, Math.max(TALLEST, size[0] / size[1])) : 4 / 5;
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

  // Tap a video for sound (on or off); double-tap anything to like it.
  // Sound flips on the first tap, inside the tap itself, because phones only
  // allow sound from a tap; a double tap flips it back.
  function onMediaTap(m) {
    const now = Date.now();
    const double = now - lastTap.current < 300;
    lastTap.current = double ? 0 : now;
    if (m.kind === 'video') toggleSound();
    if (double) {
      setBurst((n) => n + 1);
      toggleLike(true);
    }
  }

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    clearTimeout(toastTimer.current);
    setToast(next);
    if (next) toastTimer.current = setTimeout(() => setToast(false), 4000);
    try {
      if (next) await savePost(post.id);
      else await unsavePost(meId, post.id);
      onChanged?.();
    } catch (e) {
      setSaved(!next);
      setToast(false);
      setError(e.message);
    }
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

  async function block() {
    setMenu(false);
    const who = post.author.username ? `@${post.author.username}` : 'this golfer';
    if (!confirm(`Block ${who}? You won’t see each other’s posts or comments, and any follows are removed. You can unblock in Settings.`))
      return;
    try {
      await blockUser(post.userId);
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
          <Avatar profile={post.author} size={34} />
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
                {post.course.name}
              </span>
            )}
          </span>
        </button>
        <button className="post-more" onClick={() => setMenu(true)} aria-label="More">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="5" cy="12" r="1.7" fill="currentColor" />
            <circle cx="12" cy="12" r="1.7" fill="currentColor" />
            <circle cx="19" cy="12" r="1.7" fill="currentColor" />
          </svg>
        </button>
        {menu && (
          <div className="sheet-backdrop" onClick={() => setMenu(false)}>
            <div className="sheet post-menu" role="dialog" aria-modal="true" aria-label="Post options" onClick={(e) => e.stopPropagation()}>
              {mine ? (
                <button className="danger" onClick={remove}>
                  Delete post
                </button>
              ) : (
                <>
                  <button onClick={report}>Report post</button>
                  <button className="danger" onClick={block}>
                    Block {post.author.username ? `@${post.author.username}` : 'user'}
                  </button>
                </>
              )}
              <button onClick={() => setMenu(false)}>Cancel</button>
            </div>
          </div>
        )}
      </header>

      {post.locked && (
        <button className="post-locked" onClick={() => nav('user', { userId: post.userId })}>
          <span className="lock-icon" aria-hidden="true">🔒</span>
          <strong>For subscribers</strong>
          <span>Subscribe to {post.author.username ? `@${post.author.username}` : 'this instructor'} to see this post</span>
        </button>
      )}
      {post.audience === 'subscribers' && !post.locked && <p className="subs-only-tag">🔒 Subscribers only</p>}
      {post.media.length > 0 && (
        <div className="post-media">
          <div
            className="media-track"
            ref={track}
            onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            {post.media.map((m, i) => (
              <div className="media-slide" key={i} onClick={() => onMediaTap(m)} style={{ aspectRatio: ratio }}>
                {m.kind === 'video' ? (
                  <FeedVideo src={m.url} poster={m.posterUrl} onSize={i === 0 && !size ? (w, h) => w && h && setSize([w, h]) : undefined} />
                ) : (
                  <img
                    src={m.url}
                    alt=""
                    loading="lazy"
                    onLoad={i === 0 && !size ? (e) => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight]) : undefined}
                  />
                )}
              </div>
            ))}
          </div>
          {post.media.length > 1 && (
            <span className="media-count" aria-hidden="true">
              {slide + 1}/{post.media.length}
            </span>
          )}
          {burst > 0 && (
            <svg key={burst} className="like-burst" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3C14.3 6.1 15.6 5 17.6 5 21 5 22.7 8.4 21.2 11.4 19 15.6 12 20 12 20z" />
            </svg>
          )}
        </div>
      )}

      <div className="post-actions">
        {post.media.length > 1 && (
          <div className="media-dots" aria-hidden="true">
            {post.media.map((_, i) => (
              <span key={i} className={i === slide ? 'on' : ''} />
            ))}
          </div>
        )}
        <button className={`like-btn ${liked ? 'on' : ''}`} onClick={() => toggleLike()} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}>
          <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">
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
          <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">
            <path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="share-btn" onClick={() => setSheet('share')} aria-label="Share">
          <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">
            <path d="M21 3 3 10.5l7 2.5 2.5 7z M21 3 10 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </button>
        <button className={`save-btn ${saved ? 'on' : ''}`} onClick={toggleSave} aria-pressed={saved} aria-label={saved ? 'Unsave' : 'Save'}>
          <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">
            <path d="M6 3h12v18l-6-5-6 5z" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {toast && (
        <div className="save-toast">
          <span>Saved</span>
          <button
            className="link"
            onClick={() => {
              setToast(false);
              setSheet('folders');
            }}
          >
            Add to folder ›
          </button>
        </div>
      )}
      {sheet === 'share' && <ShareSheet post={post} meId={meId} onClose={() => setSheet(null)} />}
      {sheet === 'folders' && <FolderSheet post={post} meId={meId} onClose={() => setSheet(null)} />}
      <div className="post-body">
        {likes > 0 && (!post.hideLikes || mine) && <p className="post-likes">{countLabel(likes, 'like')}</p>}
        {post.hideLikes && !mine && liked && <p className="post-likes">You liked this</p>}
        {post.caption && (
          <p className="post-caption">
            <button className="caption-name" onClick={() => nav('user', { userId: post.userId })}>
              {post.author.username || post.author.displayName}
            </button>{' '}
            {open || post.caption.length <= SHORT_CAPTION ? (
              post.caption
            ) : (
              <>
                {post.caption.slice(0, SHORT_CAPTION - 10).trimEnd()}…{' '}
                <button className="caption-more" onClick={() => setOpen(true)}>
                  more
                </button>
              </>
            )}
          </p>
        )}
        {post.commentCount > 0 && (
          <button className="post-comments" onClick={() => nav('post', { postId: post.id })}>
            {post.commentCount === 1 ? 'View 1 comment' : `View all ${post.commentCount} comments`}
          </button>
        )}
        <p className="post-time">{timeAgoLong(post.createdAt)}</p>
        {error && <p className="search-error">{error}</p>}
      </div>
    </article>
  );
}
