import { useEffect, useState } from 'react';
import { listRounds, deleteRound } from '../lib/storage.js';
import { GAME_INFO } from '../lib/roundSetup.js';

export default function Home({ onNew, onOpen }) {
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
      <header className="hero">
        <h1>Golf App</h1>
        <p>Score the round. Settle the bets.</p>
      </header>
      <button className="btn btn-primary btn-xl" onClick={onNew}>
        New round
      </button>

      <h2 className="section-title">Rounds</h2>
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
