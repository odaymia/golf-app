import { useLayoutEffect, useRef, useState } from 'react';
import PostCard from './PostCard.jsx';

// A profile's (or course's) posts as one scrolling list, opened at the post
// tapped in the grid: scroll up and down to see the rest without going back.
export default function PostList({ posts: initial, startId, title, meId, nav, back }) {
  const [posts, setPosts] = useState(initial);
  const start = useRef(null);

  // Open at the tapped post, under the top bar.
  useLayoutEffect(() => {
    const el = start.current;
    if (!el) return;
    const bar = document.querySelector('.post-list-bar')?.offsetHeight ?? 0;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - bar);
  }, []);

  return (
    <div className="screen post-list">
      <div className="topbar post-list-bar">
        <button className="btn btn-ghost" onClick={back}>
          ‹ Back
        </button>
        <h1>{title || 'Posts'}</h1>
        <span />
      </div>
      {posts.length === 0 && <p className="muted center">No posts.</p>}
      {posts.map((p) => (
        <div key={p.id} ref={p.id === startId ? start : undefined}>
          <PostCard post={p} meId={meId} nav={nav} onDeleted={(id) => setPosts((list) => list.filter((x) => x.id !== id))} />
        </div>
      ))}
    </div>
  );
}
