// The one scorecard look used everywhere (Golf Genius style): Hole / Par
// header, a row per player or team, Out / In / Tot, names pinned on the
// left while you swipe sideways.
//
// rows: [{ key, name, values: [n|null per hole], kind?, side?, strokes?,
//          won?(h) -> bool, cell?(h) -> node, totals? (default true) }]
//   kind: 'player' (default), 'team', 'match' (dark row), 'info' (muted)
//   side: 0 / 1 colors names (blue / red) and holes won
//   strokes: handicap dots per hole; marks: circle birdies, box bogeys
// now: hole index to mark yellow; bad: hole indexes with a problem (red);
// onHole(h): makes score cells tappable.
export default function ScoreTable({ holes, rows, now = null, bad = [], onHole, marks = false, info = [] }) {
  const n = holes.length;
  const front = Math.min(9, n);
  const sum = (arr, a, b) => {
    let t = 0;
    let any = false;
    for (let i = a; i < b; i++) if (arr?.[i] != null) (t += arr[i]), (any = true);
    return any ? t : '';
  };
  const cols = [
    ...holes.slice(0, front).map((_, h) => ({ h })),
    ...(n > 9 ? [{ seg: [0, front], label: 'Out' }] : []),
    ...holes.slice(front).map((_, i) => ({ h: front + i })),
    { seg: [n > 9 ? front : 0, n], label: n > 9 ? 'In' : 'Tot' },
    ...(n > 9 ? [{ seg: [0, n], label: 'Tot' }] : []),
  ];
  const par = holes.map((x) => x.par);
  const shape = (g, p) => (g == null ? '' : g <= p - 2 ? 'eagle' : g === p - 1 ? 'birdie' : g === p + 1 ? 'bogey' : g >= p + 2 ? 'double' : '');

  const scoreCell = (r, h) => {
    const g = r.values?.[h];
    if (r.cell) return r.cell(h);
    const player = (r.kind ?? 'player') === 'player';
    const dots = r.strokes?.[h] > 0 ? r.strokes[h] : 0;
    const shown = g ?? (onHole && player ? '–' : '');
    const body = (
      <>
        {marks && player ? <span className={`st-s ${shape(g, par[h])}`}>{shown}</span> : shown}
        {dots > 0 && <i className="st-dots">{'•'.repeat(dots)}</i>}
      </>
    );
    if (!onHole || !player) return body;
    return (
      <button className="st-tap" onClick={() => onHole(h)} aria-label={`${r.name} hole ${h + 1}`}>
        {body}
      </button>
    );
  };

  return (
    <div className="st-scroll">
      <table className="st">
        <thead>
          <tr>
            <th className="st-name">Hole</th>
            {cols.map((c, k) => (
              <th key={k} className={c.seg ? 'st-tot' : bad.includes(c.h) ? 'st-bad' : c.h === now ? 'st-now' : ''}>
                {c.seg ? c.label : c.h + 1}
              </th>
            ))}
          </tr>
          <tr className="st-info">
            <th className="st-name">Par</th>
            {cols.map((c, k) => (
              <td key={k} className={c.seg ? 'st-tot' : ''}>
                {c.seg ? sum(par, ...c.seg) : par[c.h]}
              </td>
            ))}
          </tr>
          {info.map((r) => (
            <tr key={r.key} className="st-info">
              <th className="st-name">{r.name}</th>
              {cols.map((c, k) => (
                <td key={k} className={c.seg ? 'st-tot' : ''}>
                  {c.seg ? '' : (r.values[c.h] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`st-${r.kind ?? 'player'} ${r.side != null ? `side-${r.side}` : ''}`}>
              <th className="st-name">{r.name}</th>
              {cols.map((c, k) =>
                c.seg ? (
                  <td key={k} className="st-tot">
                    {r.totals === false ? '' : sum(r.values, ...c.seg)}
                  </td>
                ) : (
                  <td key={k} className={`${r.won?.(c.h) ? `won side-${r.side ?? 0}` : ''} ${bad.includes(c.h) ? 'st-bad' : ''}`}>
                    {scoreCell(r, c.h)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A match's scorecard: each side's players, the team row (holes won filled
// in team color) and a dark Match row per side (T = tied, "2 up" while that
// side leads). Works for league/tournament matches and casual match play.
// match: { sides, names, status, results, running, sideScores, teamBall?, format?, strokes? }
export function MatchDetail({ match, holes, net, nameOf, grossOf, sideNames }) {
  const done = match.result != null || match.status.complete || match.status.closedOut;
  const teamLabel = match.teamBall ? 'Team ball' : match.format === 'shamble' ? 'Combined' : 'Best ball';
  const matchRow = (s) => ({
    key: `m${s}`,
    name: 'Match',
    kind: 'match',
    totals: false,
    cell: (h) => {
      const u = match.running?.[h];
      if (u == null) return '';
      if (u === 0) return 'T';
      if ((s === 0) !== u > 0) return '';
      return (
        <>
          {Math.abs(u)}
          <small>up</small>
        </>
      );
    },
  });
  const side = (s) => {
    const ids = match.sides[s];
    const wonHole = (h) => match.results?.[h] === (s === 0 ? 1 : -1);
    const rows = [];
    if (!match.teamBall)
      ids.forEach((id) =>
        rows.push({ key: id, name: nameOf(id), values: grossOf(id), side: s, strokes: net ? match.strokes?.[id] : null, won: ids.length === 1 ? wonHole : null }),
      );
    if (ids.length > 1 || match.teamBall)
      rows.push({ key: `t${s}`, name: teamLabel + (net ? ' (net)' : ''), kind: 'team', values: match.sideScores?.[s] ?? [], side: s, won: wonHole });
    return rows;
  };
  const names = match.names ?? match.sides.map((ids) => ids.map(nameOf).join(' & '));
  return (
    <div className="md">
      <p className="md-title">
        {sideNames ? <b className="side-0">{sideNames[0]}</b> : null}
        {sideNames ? ` (${names[0].replace(' & ', ' + ')})` : <b className="side-0">{names[0].replace(' & ', ' + ')}</b>} vs{' '}
        {sideNames ? <b className="side-1">{sideNames[1]}</b> : null}
        {sideNames ? ` (${names[1].replace(' & ', ' + ')})` : <b className="side-1">{names[1].replace(' & ', ' + ')}</b>}
      </p>
      <ScoreTable holes={holes} now={done ? null : match.status.played} rows={[matchRow(0), ...side(0), ...side(1), matchRow(1)]} />
    </div>
  );
}
