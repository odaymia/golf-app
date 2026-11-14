import { useEffect, useState } from 'react';
import { createFolder, foldersWithPost, listFolders, setInFolder } from '../../lib/social.js';

// Pick which of your saved folders a post goes in, or make a new folder.
export default function FolderSheet({ post, meId, onClose }) {
  const [folders, setFolders] = useState(null);
  const [inFolders, setInFolders] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listFolders(meId), foldersWithPost(meId, post.id)])
      .then(([f, ids]) => {
        setFolders(f.folders);
        setInFolders(ids);
      })
      .catch((e) => {
        setError(e.message);
        setFolders([]);
      });
  }, [meId, post.id]);

  async function toggle(f) {
    const on = !inFolders.includes(f.id);
    setInFolders((ids) => (on ? [...ids, f.id] : ids.filter((x) => x !== f.id)));
    try {
      await setInFolder(f.id, post.id, on);
    } catch (e) {
      setInFolders((ids) => (on ? ids.filter((x) => x !== f.id) : [...ids, f.id]));
      setError(e.message);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const f = await createFolder(name);
      await setInFolder(f.id, post.id, true);
      setFolders((list) => [...list, { id: f.id, name: f.name, count: 1, covers: [] }]);
      setInFolders((ids) => [...ids, f.id]);
      setName('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Save to folder" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Save to folder</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
        <p className="muted small">It&apos;s always in All saved. Folders are private to you.</p>
        {folders === null && <p className="muted">Loading…</p>}
        <ul className="folder-pick">
          {(folders ?? []).map((f) => (
            <li key={f.id}>
              <button className={inFolders.includes(f.id) ? 'on' : ''} onClick={() => toggle(f)} aria-pressed={inFolders.includes(f.id)}>
                <span>{f.name}</span>
                <i className="pick-dot" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <form className="share-send" onSubmit={add}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder, e.g. Swing tips" maxLength={60} />
          <button className="btn btn-primary" disabled={!name.trim()}>
            Add
          </button>
        </form>
        {error && <p className="search-error">{error}</p>}
      </div>
    </div>
  );
}
