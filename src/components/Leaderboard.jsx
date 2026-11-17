import { useEffect, useState } from 'react';
import { homeCourses } from '../lib/social.js';
import { holeStableford } from '../lib/league/event.js';
import ScoreTable from './ScoreTable.jsx';

// A leaderboard you can tap open: each golfer's home club under their name,
// and the full scorecard under any row.
// rows: [{ key, pos, name, ids, value, valueClass, thru }]
// round: { holes, course, players } for scorecards (result of one round)
export default function Leaderboard({ rows, valueLabel, nameLabel = 'Player', round, members, settings, extraHead, extraCell }) {
  const [open, setOpen] = useState(() => new Set());
  const [clubs, setClubs] = useState(new Map());

  useEffect(() => {
    homeCourses(members.map((m) => m.userId))
      .then(setClubs)
      .catch(() => {});
  }, [members]);

  const toggleOpen = (key) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allOpen = rows.length > 0 && rows.every((r) => open.has(r.key));
  const clubOf = (ids) => {
    if (ids.length !== 1) return ids.map((id) => members.find((m) => m.id === id)?.name).join(', ');
    const m = members.find((x) => x.id === ids[0]);
    return clubs.get(m?.userId) ?? '';
  };

  const row = (r) => (
    <tbody key={r.key} className={open.has(r.key) ? 'expanded' : ''}>
      <tr className="lb2-row" onClick={() => round && toggleOpen(r.key)}>
        <td className="lb2-pos">{r.pos}</td>
        <td className="lb2-name">
          <strong>{r.name}</strong>
          {clubOf(r.ids) && <em>{clubOf(r.ids)}</em>}
        </td>
        <td className={`lb2-val ${r.valueClass ?? ''}`}>{r.value}</td>
        <td className="lb2-thru">{r.thru}</td>
        {extraHead && extraCell(r)}
      </tr>
      {open.has(r.key) && round && (
        <tr className="lb2-card">
          <td colSpan={40}>
            {r.ids.map((id) => (
              <PlayerCard key={id} id={id} round={round} members={members} settings={settings} />
            ))}
          </td>
        </tr>
      )}
    </tbody>
  );

  return (
    <section className="card lb2">
      <div className="lb2-top">
        <strong>Leaderboard</strong>
        {round && rows.length > 0 && (
          <button className="link" onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((r) => r.key)))}>
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>
      <div className="lb2-scroll">
        <table className="lb2-table">
          <thead>
            <tr>
              <th>Pos.</th>
              <th className="left">{nameLabel}</th>
              <th>{valueLabel}</th>
              <th>Thru</th>
              {extraHead}
            </tr>
          </thead>
          {rows.map(row)}
        </table>
      </div>
      {round && <p className="hint">Tap a player to see their scorecard.</p>}
    </section>
  );
}

// One player's full card for a round, in the shared scorecard look: tee
// line, Par / Stroke index, their scores (birdies circled, bogeys boxed,
// handicap dots), Stableford points.
function PlayerCard({ id, round, members, settings }) {
  const { holes, course, players } = round;
  const p = players[id];
  const name = members.find((m) => m.id === id)?.name ?? '?';
  if (!p) return null;
  const stableford = settings.scoring === 'stableford';
  const pts = holes.map((h, i) => (p.gross[i] == null ? null : holeStableford(settings, p.gross[i], p.strokes[i], h.par)));
  const net = p.gross.map((g, i) => (g == null ? null : g - (p.strokes[i] ?? 0)));
  const rows = [{ key: 'g', name: 'Score', values: p.gross, strokes: settings.net ? p.strokes : null }];
  if (settings.net && !stableford) rows.push({ key: 'n', name: 'Net', values: net, kind: 'team' });
  if (stableford) rows.push({ key: 's', name: 'Stableford pts', values: pts, kind: 'pts' });
  return (
    <div className="pc">
      <p className="pc-tee">
        <strong>{name}</strong> · {course.tee?.name} tee / Slope {course.tee?.slope} / Rating {course.tee?.rating} / {course.name} · playing {p.playing}
      </p>
      <ScoreTable holes={holes} marks info={[{ key: 'i', name: 'Stroke index', values: holes.map((h) => h.hcp) }]} rows={rows} />
    </div>
  );
}
