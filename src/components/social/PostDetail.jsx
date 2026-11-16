import { useCallback, useEffect, useRef, useState } from 'react';
import { addComment, canComment, deleteComment, findProfileByUsername, getPost, listComments, mentionCandidates } from '../../lib/social.js';
import { timeAgo } from '../../lib/socialFormat.js';
import { activeMention, insertMention, splitMentions } from '../../lib/mentions.js';
import Avatar from './Avatar.jsx';
import PostCard from './PostCard.jsx';

// How many replies show under a comment before "View more replies".
const REPLIES_SHOWN = 2;

// One post with its comments: replies (one level, like Instagram) and
// @mentions that link to profiles.
export default function PostDetail({ postId, meId, nav, back }) {
  const [post, setPost] = useState(undefined);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null); // { id (top comment), username }
  const [expanded, setExpanded] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mayComment, setMayComment] = useState(true);
  const input = useRef(null);

  const load = useCallback(async () => {
    try {
      const [p, c, ok] = await Promise.all([getPost(postId, meId), listComments(postId, meId), canComment(postId)]);
      setPost(p);
      setComments(c);
      setMayComment(ok);
    } catch (e) {
      setError(e.message);
      setPost(null);
    }
  }, [postId, meId]);

  useEffect(() => {
    load();
  }, [load]);

  // Top-level comments in order, each with its replies (oldest first).
  const top = comments.filter((c) => !c.parentId || !comments.some((x) => x.id === c.parentId));
  const repliesOf = (id) => comments.filter((c) => c.parentId === id);

  function startReply(c) {
    const root = c.parentId && comments.some((x) => x.id === c.parentId) ? c.parentId : c.id;
    const name = c.author?.username;
    setReplyTo({ id: root, username: name });
    setText(name && name !== '' ? `@${name} ` : '');
    setExpanded((s) => new Set(s).add(root));
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await addComment(postId, text, replyTo?.id ?? null);
      setText('');
      setReplyTo(null);
      setComments(await listComments(postId, meId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    const replies = repliesOf(c.id).length;
    if (!confirm(replies ? `Delete this comment and its ${replies} repl${replies === 1 ? 'y' : 'ies'}?` : 'Delete this comment?')) return;
    try {
      await deleteComment(c.id);
      setComments((cs) => cs.filter((x) => x.id !== c.id && x.parentId !== c.id));
      if (replyTo?.id === c.id) setReplyTo(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openMention(username) {
    try {
      const p = await findProfileByUsername(username);
      if (p) nav('user', { userId: p.id });
    } catch {
      // unknown name: nothing to open
    }
  }

  const row = (c, isReply) => (
    <li key={c.id} className={isReply ? 'reply' : ''}>
      <button className="comment-avatar" onClick={() => nav('user', { userId: c.userId })} aria-label={c.author?.username}>
        <Avatar profile={c.author} size={isReply ? 24 : 32} />
      </button>
      <div className="comment-main">
        <p>
          <button className="comment-name" onClick={() => nav('user', { userId: c.userId })}>
            {c.author?.username}
          </button>{' '}
          <CommentText text={c.body} onMention={openMention} />
        </p>
        <span className="comment-meta">
          {timeAgo(c.createdAt)}
          {mayComment && (
            <button className="link small-link" onClick={() => startReply(c)}>
              Reply
            </button>
          )}
          {(c.userId === meId || post.userId === meId) && (
            <button className="link small-link muted-link" onClick={() => remove(c)}>
              Delete
            </button>
          )}
        </span>
      </div>
    </li>
  );

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
            {top.map((c) => {
              const replies = repliesOf(c.id);
              const open = expanded.has(c.id);
              const shown = open ? replies : replies.slice(-REPLIES_SHOWN);
              const hidden = replies.length - shown.length;
              return (
                <li key={c.id} className="thread">
                  <ul className="comment-thread">{row(c, false)}</ul>
                  {replies.length > 0 && (
                    <ul className="comment-replies">
                      {hidden > 0 && (
                        <li className="more-replies">
                          <button className="link small-link" onClick={() => setExpanded((s) => new Set(s).add(c.id))}>
                            ── View {hidden} more repl{hidden === 1 ? 'y' : 'ies'}
                          </button>
                        </li>
                      )}
                      {shown.map((r) => row(r, true))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {mayComment ? (
            <form className="comment-form" onSubmit={send}>
              {replyTo && (
                <p className="replying">
                  Replying to <strong>@{replyTo.username}</strong>
                  <button
                    type="button"
                    className="link small-link"
                    onClick={() => {
                      setReplyTo(null);
                      setText((t) => (t.trim() === `@${replyTo.username}` ? '' : t));
                    }}
                    aria-label="Cancel reply"
                  >
                    ✕
                  </button>
                </p>
              )}
              <div className="comment-input-row">
                <MentionInput
                  inputRef={input}
                  meId={meId}
                  value={text}
                  onChange={setText}
                  placeholder={replyTo ? `Reply to @${replyTo.username}…` : 'Add a comment…'}
                />
                <button className="btn btn-primary" disabled={busy || !text.trim()}>
                  Post
                </button>
              </div>
            </form>
          ) : (
            <p className="muted small">Comments on this post are limited.</p>
          )}
          {error && <p className="search-error">{error}</p>}
        </section>
      )}
    </div>
  );
}

// Comment text with @mentions as links.
function CommentText({ text, onMention }) {
  return splitMentions(text).map((part, i) =>
    part.mention ? (
      <button key={i} className="mention" onClick={() => onMention(part.mention)}>
        {part.text}
      </button>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}

// A text box that suggests people after "@" (friends first) and inserts
// the chosen @username.
function MentionInput({ inputRef, meId, value, onChange, placeholder }) {
  const [caret, setCaret] = useState(0);
  const [people, setPeople] = useState([]);
  const [focused, setFocused] = useState(false);
  const active = focused ? activeMention(value, caret) : null;
  const query = active?.query ?? null;

  useEffect(() => {
    if (query === null) return setPeople([]);
    let live = true;
    const t = setTimeout(() => mentionCandidates(meId, query).then((list) => live && setPeople(list)).catch(() => {}), query ? 200 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, meId]);

  function pick(p) {
    const next = insertMention(value, caret, p.username);
    onChange(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  const track = (e) => setCaret(e.target.selectionStart ?? e.target.value.length);

  return (
    <div className="mention-box">
      {active && people.length > 0 && (
        <ul className="mention-menu" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" role="option" onClick={() => pick(p)}>
                <Avatar profile={p} size={28} />
                <span>
                  <strong>{p.username}</strong>
                  {p.displayName && <em>{p.displayName}</em>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        maxLength={1000}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          track(e);
        }}
        onKeyUp={track}
        onClick={track}
        onFocus={(e) => {
          setFocused(true);
          track(e);
        }}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
    </div>
  );
}
