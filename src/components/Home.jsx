import { useEffect, useState } from 'react';
import { listRounds, deleteRound } from '../lib/storage.js';
import { GAME_INFO, formatIndex } from '../lib/roundSetup.js';
import { JoinCode, LeagueDropdowns, useMyLeagues } from './LeaguesSection.jsx';
import HomeLeagueCards from './HomeLeagueCards.jsx';
import Dropdown from './Dropdown.jsx';

const greeting = (h = new Date().getHours()) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

// The first screen everyone sees: header, today's cards, the New round
// hero, one "Your golf" card (tournaments, leagues, casual rounds as
// dropdowns) and the invite code box.
export default function Home({ profile, userId, onProfile, onNew, onOpen, onOpenLeague, onCreateLeague, onTeeOff }) {
  const [rounds, setRounds] = useState(null);
  const leagues = useMyLeagues();

  useEffect(() => {
    listRounds()
      .then(setRounds)
      .catch(() => setRounds([]));
  }, []);

  async function remove(id) {
    if (!confirm('Delete this round? This cannot be undone.')) return;
    await deleteRound(id);
    setRounds(await listRounds());
  }

  const first = profile.name.trim().split(/\s+/)[0] || 'golfer';
  return (
    <div className="screen home">
      <header className="home-head">
        <img className="home-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Scribble Golf Club" />
        <button className="home-me" onClick={onProfile} aria-label="Your profile">
          <span className="home-me-text">
            <strong>{profile.name}</strong>
            <span>{profile.index == null ? 'Add your index' : `Index ${formatIndex(profile.index)}`}</span>
          </span>
          <span className="avatar">{profile.name.trim().charAt(0).toUpperCase()}</span>
        </button>
      </header>

      <HomeLeagueCards userId={userId} onTeeOff={onTeeOff} onOpenLeague={onOpenLeague} />

      <section className="home-hero">
        <p className="home-hello">
          {greeting()}, {first}
        </p>
        <h1>Play Now!</h1>
        <button className="btn home-new" onClick={onNew}>
          <span aria-hidden="true">＋</span> New round
        </button>
      </section>

      <section className="home-group" aria-label="Your golf">
        <LeagueDropdowns leagues={leagues} onOpen={onOpenLeague} onCreate={onCreateLeague} />
        <Dropdown id="casual" title="Casual rounds" count={rounds === null ? null : rounds.length}>
          {rounds === null && <p className="hg-empty">Loading…</p>}
          {rounds?.length === 0 && <p className="hg-empty">No rounds yet. Tap New round to tee it up.</p>}
          {rounds?.map((r) => {
            const done = r.players.length ? r.course.holes.filter((_, h) => r.players.every((p) => r.scores[p.id]?.[h] != null)).length : 0;
            return (
              <div key={r.id} className="hg-item-row">
                <button className="hg-item" onClick={() => onOpen(r.id)}>
                  <span className="hg-item-text">
                    <strong>{r.course.name}</strong>
                    <span>
                      {new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
                      {r.status === 'final' ? 'Final' : `Thru ${done}`} · {r.players.map((p) => p.name.split(' ')[0]).join(', ')}
                    </span>
                    <span>{r.games.map((g) => GAME_INFO[g.type]?.name).join(', ') || 'No games'}</span>
                  </span>
                </button>
                <button className="hg-del" onClick={() => remove(r.id)} aria-label="Delete round">
                  ✕
                </button>
              </div>
            );
          })}
        </Dropdown>
      </section>

      <JoinCode profile={profile} onOpen={onOpenLeague} />
    </div>
  );
}
