// Three-across square grid of posts (first photo, or a video's cover).
export default function PostGrid({ posts, onOpen, empty }) {
  if (!posts.length) return <p className="muted center grid-empty">{empty}</p>;
  return (
    <div className="post-grid">
      {posts.map((p) => {
        const m = p.media[0];
        const src = m ? (m.kind === 'video' ? m.posterUrl : m.url) : null;
        return (
          <button key={p.id} className="grid-cell" onClick={() => onOpen(p)} aria-label={p.caption || 'Open post'}>
            {p.locked ? (
              <span className="grid-locked" aria-label="For subscribers">
                🔒
              </span>
            ) : src ? (
              <img src={src} alt="" loading="lazy" />
            ) : (
              <span className="grid-text">{p.caption}</span>
            )}
            {p.audience === 'subscribers' && !p.locked ? (
              <span className="grid-badge">🔒</span>
            ) : m?.kind === 'video' ? (
              <span className="grid-badge">▶</span>
            ) : p.media.length > 1 ? (
              <span className="grid-badge">❏</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
