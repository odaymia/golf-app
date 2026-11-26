import { useEffect, useState } from 'react';
import { joinLeague, listMyLeagues } from '../lib/leagueApi.js';
import { describeLeague, leagueSettings } from '../lib/league/format.js';
import Dropdown from './Dropdown.jsx';

// My leagues and tournaments (null while loading), with their settings.
export function useMyLeagues() {
  const [leagues, setLeagues] = useState(null);
  useEffect(() => {
    listMyLeagues()
      .then((list) => setLeagues(list.map((l) => ({ ...l, s: leagueSettings(l.settings) }))))
      .catch(() => setLeagues([]));
  }, []);
  return leagues;
}

// Tournaments and Leagues rows for the home screen's "Your golf" card.
export function LeagueDropdowns({ leagues, onOpen, onCreate }) {
  const tournaments = (leagues ?? []).filter((l) => l.s.kind === 'tournament');
  const regular = (leagues ?? []).filter((l) => l.s.kind !== 'tournament');
  const rows = (items, empty) => (
    <>
      {leagues === null && <p className="hg-empty">Loading…</p>}
      {leagues !== null && items.length === 0 && <p className="hg-empty">{empty}</p>}
      {items.map((l) => (
        <button key={l.id} className="hg-item" onClick={() => onOpen(l.id)}>
          <span className="hg-item-text">
            <strong>
              {l.name}
              {l.myRole === 'watching' && <span className="mini-badge">Watching</span>}
              {l.myRole === 'organizing' && <span className="mini-badge">Organizer</span>}
            </strong>
            <span>{describeLeague(l.s)}</span>
          </span>
          <span className="hg-go" aria-hidden="true">
            ›
          </span>
        </button>
      ))}
    </>
  );
  return (
    <>
      <Dropdown id="tournaments" title="Tournaments" count={leagues === null ? null : tournaments.length}>
        {rows(tournaments, 'No tournaments yet.')}
        <button className="hg-add" onClick={() => onCreate('tournament')}>
          + Create a tournament
        </button>
      </Dropdown>
      <Dropdown id="leagues" title="Leagues" count={leagues === null ? null : regular.length}>
        {rows(regular, 'No leagues yet.')}
        <button className="hg-add" onClick={() => onCreate('league')}>
          + Create a league
        </button>
      </Dropdown>
    </>
  );
}

// Join a league or tournament with its code: your reserved spot if you're
// playing, otherwise you follow along (supabase/join_code.sql).
export function JoinCode({ profile, onOpen }) {
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  async function join(e) {
    e.preventDefault();
    if (code.trim().length < 6) return setError('Codes are 6 letters and numbers.');
    setJoining(true);
    setError('');
    try {
      onOpen(await joinLeague(code.trim(), profile));
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  }

  return (
    <section className="home-join">
      <p>Have an invite code?</p>
      <form className="join-row" onSubmit={join}>
        <input
          value={code}
          placeholder="ABC123"
          autoCapitalize="characters"
          aria-label="Invite code"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        />
        <button className="btn btn-primary" disabled={joining}>
          {joining ? 'Joining…' : 'Join'}
        </button>
      </form>
      {error && <p className="search-error">{error}</p>}
    </section>
  );
}
