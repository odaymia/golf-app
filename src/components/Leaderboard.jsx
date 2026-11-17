import { useEffect, useState } from 'react';
import { homeCourses } from '../lib/social.js';
import { holeStableford } from '../lib/league/event.js';

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

// One player's full card for a round: yardage/par/stroke index, their
// scores (birdies circled, bogeys boxed, handicap dots), Stableford points.
function PlayerCard({ id, round, members, settings }) {
  const { holes, course, players } = round;
  const p = players[id];
  const name = members.find((m) => m.id === id)?.name ?? '?';
  if (!p) return null;
  const n = holes.length;
  const front = Math.min(9, n);
  const stableford = settings.scoring === 'stableford';
  const pts = holes.map((h, i) => (p.gross[i] == null ? null : holeStableford(settings, p.gross[i], p.strokes[i], h.par)));
  const sum = (arr, a, b) => {
    let t = 0;
    let any = false;
    for (let i = a; i < b; i++) if (arr[i] != null) (t += arr[i]), (any = true);
    return any ? t : '';
  };
  const cls = (g, par) => (g == null ? '' : g <= par - 2 ? 'eagle' : g === par - 1 ? 'birdie' : g === par + 1 ? 'bogey' : g >= par + 2 ? 'double' : '');
  const par = holes.map((h) => h.par);
  const idx = holes.map((h) => h.hcp);
  const net = p.grossTotal ? p.netTotal : '';
  const segs = n > 9 ? [[0, front, 'Out'], [front, n, 'In']] : [[0, n, 'Tot']];
  return (
    <div className="pc">
      <p className="pc-tee">
        <strong>{name}</strong> · {course.tee?.name} tee / Slope {course.tee?.slope} / Rating {course.tee?.rating} / {course.name} · playing {p.playing}
      </p>
      <div className="pc-scroll">
        <table className="pc-table">
          <thead>
            <tr>
              <th className="pc-label">Hole</th>
              {segs.map(([a, b, label]) => [
                ...holes.slice(a, b).map((_, i) => <th key={`h${a + i}`}>{a + i + 1}</th>),
                <th key={label} className="pc-tot">
                  {label}
                </th>,
              ])}
              {n > 9 && <th className="pc-tot">Tot</th>}
              <th className="pc-tot">Net</th>
            </tr>
          </thead>
          <tbody>
            <tr className="pc-par">
              <td className="pc-label">Par</td>
              {segs.map(([a, b, label]) => [
                ...par.slice(a, b).map((v, i) => <td key={`p${a + i}`}>{v}</td>),
                <td key={label} className="pc-tot">
                  {sum(par, a, b)}
                </td>,
              ])}
              {n > 9 && <td className="pc-tot">{sum(par, 0, n)}</td>}
              <td className="pc-tot" />
            </tr>
            <tr className="pc-idx">
              <td className="pc-label">Stroke index</td>
              {segs.map(([a, b, label]) => [
                ...idx.slice(a, b).map((v, i) => <td key={`i${a + i}`}>{v}</td>),
                <td key={label} className="pc-tot" />,
              ])}
              {n > 9 && <td className="pc-tot" />}
              <td className="pc-tot" />
            </tr>
            <tr className="pc-score">
              <td className="pc-label">Score</td>
              {segs.map(([a, b, label]) => [
                ...p.gross.slice(a, b).map((g, i) => (
                  <td key={`g${a + i}`}>
                    <span className={`pc-s ${cls(g, par[a + i])}`}>
                      {g ?? ''}
                      {settings.net && p.strokes[a + i] > 0 && <i>{'•'.repeat(p.strokes[a + i])}</i>}
                    </span>
                  </td>
                )),
                <td key={label} className="pc-tot">
                  {sum(p.gross, a, b)}
                </td>,
              ])}
              {n > 9 && <td className="pc-tot">{sum(p.gross, 0, n)}</td>}
              <td className="pc-tot">{net}</td>
            </tr>
            {stableford && (
              <tr className="pc-pts">
                <td className="pc-label">Stableford pts</td>
                {segs.map(([a, b, label]) => [
                  ...pts.slice(a, b).map((v, i) => <td key={`s${a + i}`}>{v ?? ''}</td>),
                  <td key={label} className="pc-tot">
                    {sum(pts, a, b)}
                  </td>,
                ])}
                {n > 9 && <td className="pc-tot">{sum(pts, 0, n)}</td>}
                <td className="pc-tot" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
