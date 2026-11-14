import { matchSummary } from '../lib/games/match.js';

// Live match-play scoreboard: who's up, by how much, and who won each hole.
// names: [sideA, sideB]; status: matchStatus(); results: per-hole 1 / -1 / 0 / null.
export default function MatchCard({ names, status, results = [], label, compact = false }) {
  const s = matchSummary(status);
  const leaderClass = s.leader === 0 ? 'side-a' : s.leader === 1 ? 'side-b' : '';
  const shown = s.small === 'final' ? status.played : results.length;
  return (
    <div className={`match-card ${compact ? 'compact' : ''} ${s.small === 'final' ? 'done' : ''}`}>
      {label && <p className="match-format">{label}</p>}
      <div className="match-sides">
        <span className={`match-name side-a ${s.leader === 0 ? 'leading' : ''}`}>{names[0]}</span>
        <div
          className={`match-status ${leaderClass}`}
          aria-label={s.leader == null ? `${s.big}, ${s.small}` : `${names[s.leader]} ${s.big}, ${s.small}`}
        >
          <strong>{s.big}</strong>
          <span>{s.small}</span>
        </div>
        <span className={`match-name side-b ${s.leader === 1 ? 'leading' : ''}`}>{names[1]}</span>
      </div>
      {!compact && results.length > 0 && (
        <div className="match-holes" aria-label="Hole by hole">
          {results.map((r, i) => (
            <span
              key={i}
              title={`Hole ${i + 1}`}
              className={`mh ${i >= shown ? 'after' : r === 1 ? 'a' : r === -1 ? 'b' : r === 0 ? 'halved' : ''}`}
            >
              {i + 1}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
