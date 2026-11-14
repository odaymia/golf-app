import { useCallback, useEffect, useState } from 'react';
import { createFolder, deleteFolder, getFolder, listFolderPosts, listFolders, listSaved, renameFolder } from '../../lib/social.js';
import PostGrid from './PostGrid.jsx';

// Your saved posts: "All saved" and your own folders. Private to you.
export default function SavedPage({ meId, nav, back }) {
  const [data, setData] = useState(null);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    listFolders(meId)
      .then(setData)
      .catch((e) => {
        setError(e.message);
        setData({ all: { covers: [] }, folders: [] });
      });
  }, [meId]);
  useEffect(load, [load]);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createFolder(name);
      setName('');
      setAdding(false);
      load();
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
        <h1>Saved</h1>
        <button className="btn btn-ghost" onClick={() => setAdding((a) => !a)} aria-label="New folder">
          + Folder
        </button>
      </div>
      <p className="muted center small">Only you can see what you save.</p>
      {adding && (
        <form className="card share-send" onSubmit={add}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder name, e.g. Courses to play" maxLength={60} />
          <button className="btn btn-primary" disabled={!name.trim()}>
            Create
          </button>
        </form>
      )}
      {error && <div className="card warn-box">{error}</div>}
      {data === null ? (
        <p className="muted center">Loading…</p>
      ) : (
        <div className="folder-grid">
          <FolderTile name="All saved" covers={data.all.covers} onOpen={() => nav('folder', { folderId: 'all' })} />
          {data.folders.map((f) => (
            <FolderTile
              key={f.id}
              name={f.name}
              count={f.count}
              covers={f.covers}
              onOpen={() => nav('folder', { folderId: f.id })}
            />
          ))}
        </div>
      )}
      {data && data.folders.length === 0 && (
        <p className="hint center">
          Tap the bookmark on any post to save it. Make folders like &ldquo;Swing tips&rdquo; or &ldquo;Courses to play&rdquo; to sort them.
        </p>
      )}
    </div>
  );
}

function FolderTile({ name, count, covers, onOpen }) {
  return (
    <button className="folder-tile" onClick={onOpen}>
      <span className={`folder-covers n${Math.min(covers.length, 4)}`}>
        {covers.slice(0, 4).map((src, i) => (
          <img key={i} src={src} alt="" loading="lazy" />
        ))}
        {covers.length === 0 && <span className="folder-empty">🔖</span>}
      </span>
      <strong>{name}</strong>
      {count != null && <em>{count === 1 ? '1 post' : `${count} posts`}</em>}
    </button>
  );
}

// One folder (or "All saved") as a grid; tap a post to scroll through them.
export function FolderPage({ folderId, meId, nav, back }) {
  const all = folderId === 'all';
  const [folder, setFolder] = useState(all ? { name: 'All saved' } : null);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!all) {
          const f = await getFolder(folderId);
          if (!f) return setFolder(false);
          setFolder(f);
        }
        setPosts(all ? await listSaved(meId) : await listFolderPosts(folderId, meId));
      } catch (e) {
        setError(e.message);
        setPosts([]);
      }
    })();
  }, [all, folderId, meId]);

  async function rename() {
    setMenu(false);
    const next = prompt('Folder name', folder.name);
    if (!next?.trim()) return;
    try {
      await renameFolder(folderId, next);
      setFolder((f) => ({ ...f, name: next.trim() }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove() {
    setMenu(false);
    if (!confirm(`Delete the folder “${folder.name}”? The posts stay in All saved.`)) return;
    try {
      await deleteFolder(folderId);
      back();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={back}>
          ‹ Saved
        </button>
        <h1>{folder ? folder.name : folder === false ? 'Folder' : ''}</h1>
        {!all && folder ? (
          <button className="btn btn-ghost" onClick={() => setMenu((m) => !m)} aria-label="Folder options">
            ⋯
          </button>
        ) : (
          <span />
        )}
      </div>
      {menu && (
        <div className="card stack">
          <button className="btn btn-ghost full" onClick={rename}>
            Rename folder
          </button>
          <button className="btn btn-ghost full danger" onClick={remove}>
            Delete folder
          </button>
        </div>
      )}
      {folder === false && <div className="card warn-box">This folder was deleted.</div>}
      {error && <div className="card warn-box">{error}</div>}
      {posts === null ? (
        <p className="muted center">Loading…</p>
      ) : (
        <PostGrid
          posts={posts}
          onOpen={(p) => nav('posts', { posts, startId: p.id, title: folder?.name || 'Saved' })}
          empty={all ? 'Nothing saved yet. Tap the bookmark on a post to save it.' : 'No posts in this folder yet. Save a post, then tap “Add to folder”.'}
        />
      )}
    </div>
  );
}
