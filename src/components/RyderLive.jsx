import { matchSummary } from '../lib/games/match.js';
import { MATCH_FORMATS } from '../lib/league/event.js';

const pts = (x) => {
  const whole = Math.floor(x);
  const half = x - whole >= 0.5;
  return whole === 0 && half ? '½' : `${whole}${half ? '½' : ''}`;
};

// Ryder Cup scoreboard: Cup points per side (with what they'd be if every
// match on the course ended now) and every match in this round.
// standings: computed.standings (ryder rows); result: this round's result.
// onOpenMatch(i): tap a match (results board); roundPoints: show this
// round's points under the totals.
export default function RyderLive({ sides, standings, result, myIds = [], onOpenMatch, roundPoints = false }) {
  const row = (side) => standings.find((r) => r.key === side) ?? { total: 0, projected: 0 };
  const [a, b] = sides.map(row);
  const matches = result?.matches ?? [];
  const round = sides.map((s) => result?.cup?.[s] ?? 0);
  return (
    <section className={`card ryder-live ${onOpenMatch ? 'board' : ''}`}>
      <div className="ryder-score">
        <div className="side side-0">
          <span>{sides[0]}</span>
          <strong>{pts(a.total)}</strong>
          {a.projected !== a.total && <em>proj. {pts(a.projected)}</em>}
        </div>
        <div className="ryder-vs">
          Cup points
          {roundPoints && (
            <small>
              This round {pts(round[0])}–{pts(round[1])}
            </small>
          )}
        </div>
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
            const final = sum.small === 'final';
            const mine = m.sides.flat().some((id) => myIds.includes(id));
            const Tag = onOpenMatch ? 'button' : 'div';
            return (
              <li key={i} className={`${mine ? 'mine' : ''} ${final ? 'final' : ''}`}>
                <Tag className="lm-row" {...(onOpenMatch ? { onClick: () => onOpenMatch(i), 'aria-label': `${m.names[0]} vs ${m.names[1]}, open scorecard` } : {})}>
                  <span className={`lm-name ${leader === 0 ? `lead side-0 ${final ? 'won' : ''}` : ''}`}>{m.names[0]}</span>
                  <span className={`lm-status ${leader === null ? '' : `side-${leader}`} ${final ? 'final' : ''}`}>
                    <b>{m.status.played === 0 ? '–' : sum.big}</b>
                    <small>{m.status.played === 0 ? 'not started' : final ? 'FINAL' : sum.small}</small>
                  </span>
                  <span className={`lm-name right ${leader === 1 ? `lead side-1 ${final ? 'won' : ''}` : ''}`}>{m.names[1]}</span>
                  {onOpenMatch && <span className="lm-format">{MATCH_FORMATS[m.format].short}</span>}
                </Tag>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
