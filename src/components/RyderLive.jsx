import { matchSummary } from '../lib/games/match.js';
import { MATCH_FORMATS } from '../lib/league/event.js';

const pts = (x) => {
  const whole = Math.floor(x);
  const half = x - whole >= 0.5;
  return whole === 0 && half ? '½' : `${whole}${half ? '½' : ''}`;
};

// Ryder Cup leaderboard while scoring: points per side (with what they'd be
// if every match on the course ended now) and every match in this round.
// standings: computed.standings (ryder rows); result: this round, live.
export default function RyderLive({ sides, standings, result, myIds = [] }) {
  const row = (side) => standings.find((r) => r.key === side) ?? { total: 0, projected: 0 };
  const [a, b] = sides.map(row);
  const matches = result?.matches ?? [];
  return (
    <section className="card ryder-live">
      <div className="ryder-score">
        <div className="side side-0">
          <span>{sides[0]}</span>
          <strong>{pts(a.total)}</strong>
          {a.projected !== a.total && <em>proj. {pts(a.projected)}</em>}
        </div>
        <div className="ryder-vs">Cup points</div>
        <div className="side side-1">
          <span>{sides[1]}</span>
          <strong>{pts(b.total)}</strong>
          {b.projected !== b.total && <em>proj. {pts(b.projected)}</em>}
        </div>
      </div>
      {matches.length > 0 && (
        <ul className="ryder-live-matches">
          {matches.map((m, i) => {
            const sum = matchSummary(m.status);
            const leader = sum.leader;
            const mine = m.sides.flat().some((id) => myIds.includes(id));
            return (
              <li key={i} className={mine ? 'mine' : ''}>
                <span className={`lm-name ${leader === 0 ? 'lead side-0' : ''}`}>{m.names[0]}</span>
                <span className={`lm-status ${leader === null ? '' : `side-${leader}`}`}>
                  <b>{m.status.played === 0 ? MATCH_FORMATS[m.format].short : sum.big}</b>
                  <small>{m.status.played === 0 ? 'not started' : sum.small}</small>
                </span>
                <span className={`lm-name right ${leader === 1 ? 'lead side-1' : ''}`}>{m.names[1]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
