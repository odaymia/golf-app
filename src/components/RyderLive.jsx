import { useEffect, useState } from 'react';
import { matchSummary } from '../lib/games/match.js';
import { MATCH_FORMATS } from '../lib/league/event.js';
import { homeCourses } from '../lib/social.js';

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
export default function RyderLive({ sides, standings, result, myIds = [], onOpenMatch, roundPoints = false, members = [], title }) {
  if (onOpenMatch)
    return (
      <>
        <TeamPoints sides={sides} standings={standings} />
        <MatchBoard sides={sides} result={result} members={members} title={title} myIds={myIds} onOpenMatch={onOpenMatch} />
      </>
    );
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

// Team points leaderboard: each side's points per round, total, and what
// it would be if every match on the course ended now.
function TeamPoints({ sides, standings }) {
  const rows = sides
    .map((side, i) => ({ side, i, ...(standings.find((r) => r.key === side) ?? { total: 0, projected: 0, rounds: [] }) }))
    .sort((a, b) => b.total - a.total || b.projected - a.projected);
  const n = Math.max(0, ...rows.map((r) => r.rounds?.length ?? 0));
  const showProj = rows.some((r) => r.projected !== r.total);
  return (
    <section className="card tp">
      <strong className="tp-title">Team points</strong>
      <div className="lb2-scroll">
        <table className="tp-table">
          <thead>
            <tr>
              <th className="left">Team</th>
              {n > 1 && Array.from({ length: n }, (_, k) => <th key={k}>R{k + 1}</th>)}
              <th>Total</th>
              {showProj && <th>Proj.</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.side} className={`side-${r.i}`}>
                <td className="tp-team">
                  <i />
                  {r.side}
                </td>
                {n > 1 && r.rounds.map((x, k) => <td key={k}>{pts(x)}</td>)}
                <td className="tp-total">{pts(r.total)}</td>
                {showProj && <td className="tp-proj">{pts(r.projected)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// This round's matches: points | side A | status | side B | points, the
// winner's side filled in its team color, totals at the bottom.
function MatchBoard({ sides, result, members, title, myIds, onOpenMatch }) {
  const [clubs, setClubs] = useState(new Map());
  useEffect(() => {
    homeCourses(members.map((m) => m.userId).filter(Boolean))
      .then(setClubs)
      .catch(() => {});
  }, [members]);
  const matches = result?.matches ?? [];
  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? '?';
  const clubOf = (ids) =>
    [...new Set(ids.map((id) => clubs.get(members.find((m) => m.id === id)?.userId)).filter(Boolean))].join(', ');
  const formats = [...new Set(matches.map((m) => MATCH_FORMATS[m.format].short))].join(' / ');
  const total = [0, 0];
  const rows = matches.map((m) => {
    const sum = matchSummary(m.status);
    const final = m.result != null;
    const p = m.result === 'A' ? [1, 0] : m.result === 'B' ? [0, 1] : m.result === 'halved' ? [0.5, 0.5] : null;
    if (p) (total[0] += p[0]), (total[1] += p[1]);
    return { m, sum, final, p, lead: m.status.played === 0 ? null : sum.leader };
  });
  const cell = (r, k) => {
    const won = r.final && r.lead === k;
    const ahead = !r.final && r.lead === k;
    return (
      <span className={`mb-side mb-${k === 0 ? 'a' : 'b'} ${won ? `won side-${k}` : ''} ${ahead ? `ahead side-${k}` : ''}`}>
        {r.m.sides[k].map((id) => (
          <b key={id}>{nameOf(id)}</b>
        ))}
        {clubOf(r.m.sides[k]) && <em>{clubOf(r.m.sides[k])}</em>}
      </span>
    );
  };
  return (
    <section className="card mb">
      <div className="mb-title">
        <strong>{title}</strong>
        {formats && <span>{formats}</span>}
      </div>
      <div className="mb-grid mb-head">
        <span>Pts</span>
        <span className="mb-a">{sides[0]}</span>
        <span>Match</span>
        <span className="mb-b">{sides[1]}</span>
        <span>Pts</span>
      </div>
      {rows.map((r, i) => {
        const mine = r.m.sides.flat().some((id) => myIds.includes(id));
        const status = r.m.status.played === 0 ? '–' : r.final && r.lead === null ? 'tied' : r.sum.big;
        const sub = r.m.status.played === 0 ? 'not started' : r.final ? 'F' : r.sum.small;
        return (
          <button
            key={i}
            className={`mb-grid mb-row ${mine ? 'mine' : ''}`}
            onClick={() => onOpenMatch(i)}
            aria-label={`${r.m.names[0]} vs ${r.m.names[1]}, ${status}, open scorecard`}
          >
            <span className={`mb-pts ${r.final && r.lead === 0 ? 'won side-0' : ''}`}>{r.p ? pts(r.p[0]) : ''}</span>
            {cell(r, 0)}
            <span
              className={`mb-status ${r.lead === null ? (r.final ? 'halved' : '') : `side-${r.lead} ${r.lead === 0 ? 'left' : 'right'}`} ${r.final ? 'final' : 'live'}`}
            >
              <b>{status}</b>
              <small>{sub}</small>
            </span>
            {cell(r, 1)}
            <span className={`mb-pts ${r.final && r.lead === 1 ? 'won side-1' : ''}`}>{r.p ? pts(r.p[1]) : ''}</span>
          </button>
        );
      })}
      <div className="mb-grid mb-foot">
        <span>{pts(total[0])}</span>
        <span className="mb-a">{sides[0]}</span>
        <span>Total</span>
        <span className="mb-b">{sides[1]}</span>
        <span>{pts(total[1])}</span>
      </div>
    </section>
  );
}
