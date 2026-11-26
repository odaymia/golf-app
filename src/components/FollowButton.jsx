import { useEffect, useState } from 'react';
import { follow, followStates, unfollow } from '../lib/social.js';

// Follow states for a list of golfers (Map userId -> { state, followsMe }),
// plus a setter for after a tap. Empty until loaded or if it fails.
export function useFollowStates(meId, userIds) {
  const [states, setStates] = useState(new Map());
  const key = [...new Set(userIds.filter(Boolean))].sort().join(',');
  useEffect(() => {
    let live = true;
    followStates(meId, key ? key.split(',') : [])
      .then((m) => live && setStates(m))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [meId, key]);
  const update = (id, state) => setStates((m) => new Map(m).set(id, { ...m.get(id), state }));
  return [states, update];
}

// Follow / Follow back / Requested / Following for one golfer.
export default function FollowButton({ meId, userId, name, info, onChange }) {
  const [busy, setBusy] = useState(false);
  if (!info || !meId || userId === meId) return null;
  const { state, followsMe } = info;
  const label = state === 'following' ? 'Following' : state === 'pending' ? 'Requested' : followsMe ? 'Follow back' : 'Follow';
  async function tap() {
    setBusy(true);
    try {
      if (state === 'none') onChange(await follow(userId));
      else {
        if (!confirm(state === 'pending' ? `Cancel your follow request to ${name}?` : `Unfollow ${name}?`)) return;
        await unfollow(meId, userId);
        onChange('none');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className={`fl-btn small ${state === 'none' ? 'solid' : 'soft'}`} onClick={tap} disabled={busy} aria-label={`${label} ${name}`}>
      {label}
    </button>
  );
}
