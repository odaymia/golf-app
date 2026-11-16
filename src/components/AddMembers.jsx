import { useEffect, useState } from 'react';
import { findGolfers } from '../lib/social.js';
import { addAccounts } from '../lib/leagueApi.js';
import { formatIndex } from '../lib/roundSetup.js';
import Avatar from './social/Avatar.jsx';

// Commissioner: add players who have Scribble accounts (friends first, then
// search everyone). They join linked to their account with their shared
// handicap index. People not on Scribble get an invite (link or email).
export default function AddMembers({ league, members, meId, onAdded, onClose }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inLeague = new Set(members.map((m) => m.userId).filter(Boolean));

  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () =>
        findGolfers(meId, q)
          .then((g) => live && setList(g))
          .catch((e) => live && (setError(e.message), setList([]))),
      q.trim() ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, meId]);

  const isPicked = (g) => picked.some((x) => x.id === g.id);
  const toggle = (g) => setPicked((p) => (isPicked(g) ? p.filter((x) => x.id !== g.id) : [...p, g]));

  async function add() {
    setBusy(true);
    setError('');
    try {
      const n = await addAccounts(league.id, picked, members);
      setPicked([]);
      onAdded(n);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const shown = (list ?? []).filter((g) => g.id !== meId);
  return (
    <section className="card add-members">
      <div className="pro-card-head">
        <h3>Add Scribble members</h3>
        {onClose && (
          <button className="btn btn-ghost btn-small" onClick={onClose}>
            Done
          </button>
        )}
      </div>
      <input
        className="share-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search friends and golfers on Scribble"
        aria-label="Search golfers"
      />
      {!q.trim() && <p className="ps-h">Your friends</p>}
      {list === null && <p className="muted">Loading…</p>}
      {list && shown.length === 0 && (
        <p className="muted small">{q.trim().length >= 2 ? 'No golfers found.' : 'Follow golfers to see them here, or search by name.'}</p>
      )}
      <ul className="people-pick">
        {shown.map((g) => {
          const already = inLeague.has(g.id);
          return (
            <li key={g.id}>
              <button className={isPicked(g) ? 'on' : ''} onClick={() => !already && toggle(g)} disabled={already} aria-pressed={isPicked(g)}>
                <Avatar profile={g} size={40} />
                <span>
                  <strong>{g.name}</strong>
                  <em>
                    {g.username ? `@${g.username}` : ''}
                    {g.index != null ? ` · index ${formatIndex(g.index)}` : ''}
                    {already ? ' · already in' : ''}
                  </em>
                </span>
                {!already && <i className="pick-dot" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="search-error">{error}</p>}
      {picked.length > 0 && (
        <button className="btn btn-primary full" disabled={busy} onClick={add}>
          {busy ? 'Adding…' : `Add ${picked.length} player${picked.length === 1 ? '' : 's'}`}
        </button>
      )}
      <p className="hint">
        Not on Scribble yet? Send them the invite link (code {league.code}); they join once they create an account.
      </p>
    </section>
  );
}
