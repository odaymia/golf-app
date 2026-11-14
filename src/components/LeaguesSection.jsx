import { useEffect, useState } from 'react';
import { joinLeague, listMyLeagues } from '../lib/leagueApi.js';
import { describeLeague, defaultLeagueSettings, normalizeSettings } from '../lib/league/format.js';

// "My leagues" on the home screen: open, create, or join with a code.
export default function LeaguesSection({ profile, onOpen, onCreate }) {
  const [leagues, setLeagues] = useState(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listMyLeagues()
      .then(setLeagues)
      .catch(() => setLeagues([]));
  }, []);

  async function join(e) {
    e.preventDefault();
    if (code.trim().length < 6) return setError('Codes are 6 letters and numbers.');
    setJoining(true);
    setError('');
    try {
      const id = await joinLeague(code.trim(), profile);
      onOpen(id);
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  }

  return (
    <>
      <h2 className="section-title">Leagues</h2>
      {leagues === null && <p className="muted">Loading…</p>}
      <ul className="round-list">
        {leagues?.map((l) => (
          <li key={l.id} className="card round-item">
            <button className="round-open" onClick={() => onOpen(l.id)}>
              <strong>{l.name}</strong>
              <span className="muted">{describeLeague(normalizeSettings({ ...defaultLeagueSettings(), ...l.settings }))}</span>
            </button>
          </li>
        ))}
      </ul>
      <form className="card join-row" onSubmit={join}>
        <input
          value={code}
          placeholder="Invite code"
          autoCapitalize="characters"
          aria-label="League invite code"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        />
        <button className="btn btn-primary" disabled={joining}>
          {joining ? 'Joining…' : 'Join'}
        </button>
      </form>
      {error && <p className="search-error">{error}</p>}
      <button className="btn btn-ghost btn-xl" onClick={onCreate}>
        + Create a league
      </button>
    </>
  );
}
