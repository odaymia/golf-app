import { useEffect } from 'react';
import MatchCard from './MatchCard.jsx';

const TEAM_ROW = { fourball: 'Team', shamble: 'Team', singles: null };

// Full hole-by-hole card for one match, in a panel over the screen.
// match: { sides, names, format?, teamBall?, status, results, running, sideScores, strokes }
// holes: [{ par, hcp }]; grossOf(id) -> [scores]; nameOf(id) -> name.
export default function MatchScorecard({ match, holes, grossOf, nameOf, net, label, sideNames, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const played = match.status.played;
  const teamLabel = match.teamBall ? null : TEAM_ROW[match.format ?? (match.sides[0].length > 1 ? 'fourball' : 'singles')];
  // A side's rows: each player (own ball), plus the team score; or one team row.
  const rowsFor = (side, s) => {
    if (match.teamBall) {
      const ids = match.sides[s];
      const team = holes.map((_, h) => {
        const id = ids.find((x) => grossOf(x)[h] != null);
        return id == null ? null : grossOf(id)[h];
      });
      return [{ key: `t${s}`, name: match.names[s], scores: team, strokes: match.strokes[ids[0]], kind: 'team-ball' }];
    }
    const rows = side.map((id) => ({ key: id, name: nameOf(id), scores: grossOf(id), strokes: match.strokes[id], kind: 'player' }));
    if (side.length > 1 && teamLabel) {
      rows.push({ key: `team${s}`, name: teamLabel, scores: match.sideScores[s], kind: 'team' });
    }
    return rows;
  };
  const rowsA = rowsFor(match.sides[0], 0);
  const rowsB = rowsFor(match.sides[1], 1);

  const nine = (from, to, title) => {
    const range = holes.slice(from, to).map((_, i) => from + i);
    const sum = (arr) => {
      const vals = range.map((h) => arr[h]).filter((v) => v != null);
      return vals.length ? vals.reduce((x, y) => x + y, 0) : '';
    };
    const row = (r, side) => (
      <tr key={r.key} className={`${r.kind} side-${side}`}>
        <td className="sc-name">{r.name}</td>
        {range.map((h) => {
          const v = r.scores[h];
          const diff = v == null ? null : v - holes[h].par;
          const dots = net && r.strokes ? r.strokes[h] : 0;
          return (
            <td
              key={h}
              className={`${h >= played ? 'after' : ''} ${r.kind !== 'team' && diff != null ? (diff < 0 ? 'under' : diff > 0 ? 'over' : '') : ''}`}
            >
              {v ?? ''}
              {dots > 0 && <sup>{'•'.repeat(dots)}</sup>}
            </td>
          );
        })}
        <td className="sc-total">{sum(r.scores)}</td>
      </tr>
    );
    return (
      <table className="scorecard match-sc" key={title}>
        <thead>
          <tr>
            <th>Hole</th>
            {range.map((h) => (
              <th key={h}>{h + 1}</th>
            ))}
            <th>{title}</th>
          </tr>
          <tr className="par-row">
            <td>Par</td>
            {range.map((h) => (
              <td key={h}>{holes[h].par}</td>
            ))}
            <td>{sum(holes.map((x) => x.par))}</td>
          </tr>
        </thead>
        <tbody>
          {rowsA.map((r) => row(r, 'a'))}
          <tr className="status-row">
            <td className="sc-name">Match</td>
            {range.map((h) => {
              const u = match.running[h];
              return (
                <td key={h} className={u == null ? '' : u > 0 ? 'lead-a' : u < 0 ? 'lead-b' : 'as'}>
                  {u == null ? '' : u === 0 ? 'AS' : Math.abs(u)}
                </td>
              );
            })}
            <td />
          </tr>
          {rowsB.map((r) => row(r, 'b'))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Match scorecard" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Scorecard</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <MatchCard names={match.names} status={match.status} results={match.results} label={label} />
        <div className="scorecard-wrap">
          {nine(0, Math.min(9, holes.length), 'Out')}
          {holes.length > 9 && nine(9, holes.length, 'In')}
        </div>
        <p className="hint">
          Match row: holes up after each hole, in the leader&apos;s color
          {sideNames ? ` (${sideNames[0]} green, ${sideNames[1]} pink)` : ''}; AS = all square.
          {net ? ' Dots are handicap strokes in this match.' : ''}
          {teamLabel
            ? ` Team row: the team's ${match.format === 'shamble' ? 'combined score' : 'best score'} on each hole${net ? ', net' : ''}.`
            : ''}
          {played < holes.length && match.status.closedOut ? ' Holes after the match ended are faded.' : ''}
        </p>
      </div>
    </div>
  );
}
