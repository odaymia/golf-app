import { useEffect, useState } from 'react';
import { listRounds, deleteRound } from '../lib/storage.js';
import { GAME_INFO, formatIndex } from '../lib/roundSetup.js';
import LeaguesSection from './LeaguesSection.jsx';

export default function Home({ profile, onProfile, onNew, onOpen, onOpenLeague, onCreateLeague }) {
  const [rounds, setRounds] = useState(null);

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

  return (
    <div className="screen">
      <div className="home-top">
        <button className="profile-chip" onClick={onProfile} aria-label="Your profile">
          <span className="avatar">{profile.name.trim().charAt(0).toUpperCase()}</span>
          <span>
            <strong>{profile.name}</strong>
            <span className="muted">
              {profile.index == null ? 'Add your index' : `Index ${formatIndex(profile.index)}`}
            </span>
          </span>
        </button>
      </div>
      <header className="hero">
        <h1>Golf App</h1>
        <p>Score the round. Settle the bets.</p>
      </header>
      <button className="btn btn-primary btn-xl" onClick={onNew}>
        New round
      </button>

      <LeaguesSection profile={profile} onOpen={onOpenLeague} onCreate={onCreateLeague} />

      <h2 className="section-title">Casual rounds</h2>
      {rounds === null && <p className="muted">Loading…</p>}
      {rounds?.length === 0 && <p className="muted">No rounds yet. Tap New round to tee it up.</p>}
      <ul className="round-list">
        {rounds?.map((r) => {
          const done = r.players.length
            ? r.course.holes.filter((_, h) => r.players.every((p) => r.scores[p.id]?.[h] != null)).length
            : 0;
          return (
            <li key={r.id} className="card round-item">
              <button className="round-open" onClick={() => onOpen(r.id)}>
                <strong>{r.course.name}</strong>
                <span className="muted">
                  {new Date(r.createdAt).toLocaleDateString()} · {r.players.map((p) => p.name).join(', ')}
                </span>
                <span className="muted">
                  {r.status === 'final' ? 'Final' : `Thru ${done}`} ·{' '}
                  {r.games.map((g) => GAME_INFO[g.type]?.name).join(', ') || 'No games'}
                </span>
              </button>
              <button className="btn btn-ghost btn-small" onClick={() => remove(r.id)} aria-label="Delete round">
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
