import { useEffect, useRef, useState } from 'react';
import { findGolfers } from '../lib/social.js';
import { formatIndex } from '../lib/roundSetup.js';
import Avatar from './social/Avatar.jsx';

// A player's name box that searches as you type: your saved players, then
// friends you follow, then other Scribble golfers. Picking one fills in the
// name and their handicap index (if they share it). Typing any name still
// works for golfers who aren't on Scribble.
export default function PlayerSearch({ value, onChange, onPick, saved = [], recent = [], meId, exclude = [], placeholder, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [golfers, setGolfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const blurTimer = useRef(null);
  const q = value.trim();

  useEffect(() => {
    if (!open || !meId) return;
    let live = true;
    setLoading(true);
    const t = setTimeout(
      () =>
        findGolfers(meId, q)
          .then((list) => live && setGolfers(list))
          .catch(() => live && setGolfers([]))
          .finally(() => live && setLoading(false)),
      q ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, q, meId]);

  const lower = q.toLowerCase();
  const savedMatches = saved.filter((p) => !exclude.includes(`saved:${p.id}`) && (!lower || p.name.toLowerCase().includes(lower))).slice(0, 5);
  const golferMatches = golfers.filter((g) => !exclude.includes(`user:${g.id}`) && g.id !== meId);
  // Recent players (remembered on this phone; works offline), then friends, then everyone else.
  const recentMatches = recent
    .filter((g) => !exclude.includes(`user:${g.id}`) && g.id !== meId)
    .filter((g) => !lower || `${g.name} ${g.username}`.toLowerCase().includes(lower))
    .slice(0, 5);
  const notRecent = (g) => !recentMatches.some((r) => r.id === g.id);
  const friends = golferMatches.filter((g) => g.friend && notRecent(g));
  const others = golferMatches.filter((g) => !g.friend && notRecent(g));
  const any = savedMatches.length + recentMatches.length + friends.length + others.length > 0;

  function pick(p) {
    clearTimeout(blurTimer.current);
    setOpen(false);
    onPick(p);
  }

  const indexLabel = (n) => (n == null ? 'no index' : formatIndex(n));

  return (
    <div className="player-search grow">
      <input
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => (blurTimer.current = setTimeout(() => setOpen(false), 150))}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
      {open && (any || loading || q.length >= 2) && (
        <div className="ps-menu" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {savedMatches.length > 0 && (
            <>
              <p className="ps-h">My players</p>
              {savedMatches.map((p) => (
                <button
                  key={`s-${p.id}`}
                  role="option"
                  className="ps-row"
                  onClick={() => pick({ name: p.name, index: p.index, savedId: p.id, userId: null })}
                >
                  <span className="avatar ps-av">{p.name.charAt(0).toUpperCase()}</span>
                  <span className="ps-text">
                    <strong>{p.name}</strong>
                  </span>
                  <span className="ps-index">{indexLabel(p.index)}</span>
                </button>
              ))}
            </>
          )}
          {recentMatches.length > 0 && <p className="ps-h">Recent players</p>}
          {recentMatches.map((g) => (
            <GolferRow key={`r-${g.id}`} g={g} pick={pick} indexLabel={indexLabel} />
          ))}
          {friends.length > 0 && <p className="ps-h">Friends</p>}
          {friends.map((g) => (
            <GolferRow key={g.id} g={g} pick={pick} indexLabel={indexLabel} />
          ))}
          {others.length > 0 && <p className="ps-h">Scribble golfers</p>}
          {others.map((g) => (
            <GolferRow key={g.id} g={g} pick={pick} indexLabel={indexLabel} />
          ))}
          {loading && !golferMatches.length && <p className="ps-h muted">Searching…</p>}
          {!loading && q.length >= 2 && !any && <p className="ps-h muted">No Scribble member named “{q}”. Invite them below.</p>}
        </div>
      )}
    </div>
  );
}

function GolferRow({ g, pick, indexLabel }) {
  return (
    <button role="option" className="ps-row" onClick={() => pick({ name: g.name, index: g.index, savedId: null, userId: g.id })}>
      <Avatar profile={g} size={32} />
      <span className="ps-text">
        <strong>{g.name}</strong>
        {g.username && <em>@{g.username}</em>}
      </span>
      <span className="ps-index">{indexLabel(g.index)}</span>
    </button>
  );
}
