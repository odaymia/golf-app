import { useEffect } from 'react';
import MatchCard from './MatchCard.jsx';

// A plain scorecard for one match, in a panel over the screen: hole, par,
// then each player's scores (birdies circled, bogeys boxed, stroke dots),
// one row across all 18 holes that you swipe sideways. One-ball formats
// (scramble, foursomes) show one row per team.
// match: { sides, names, teamBall?, status, strokes }
// holes: [{ par, hcp }]; grossOf(id) -> [scores]; nameOf(id) -> name.
export default function MatchScorecard({ match, holes, grossOf, nameOf, net, label, onClose }) {
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

  const short = (name) => {
    const [first, ...rest] = name.split(' ');
    return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
  };
  const rows = match.sides.flatMap((ids, s) => {
    if (match.teamBall) {
      const team = holes.map((_, h) => {
        const id = ids.find((x) => grossOf(x)[h] != null);
        return id == null ? null : grossOf(id)[h];
      });
      return [{ key: `t${s}`, side: s, name: ids.map((id) => nameOf(id).split(' ')[0]).join(' & '), scores: team, strokes: match.strokes[ids[0]] }];
    }
    return ids.map((id) => ({ key: id, side: s, name: short(nameOf(id)), scores: grossOf(id), strokes: match.strokes[id] }));
  });

  const n = holes.length;
  const front = Math.min(9, n);
  const segs = n > 9 ? [[0, front, 'Out'], [front, n, 'In']] : [[0, n, 'Tot']];
  const sum = (arr, a, b) => {
    let t = 0;
    let any = false;
    for (let i = a; i < b; i++) if (arr[i] != null) (t += arr[i]), (any = true);
    return any ? t : '';
  };
  const cls = (g, par) => (g == null ? '' : g <= par - 2 ? 'eagle' : g === par - 1 ? 'birdie' : g === par + 1 ? 'bogey' : g >= par + 2 ? 'double' : '');
  const par = holes.map((h) => h.par);
  // Each hole's cells, then each nine's total (and the 18-hole total).
  const cells = (valueOf, totalOf, key, head = false) => {
    const Tag = head ? 'th' : 'td';
    return [
      ...segs.flatMap(([a, b, label]) => [
        ...holes.slice(a, b).map((_, i) => <Tag key={`${key}${a + i}`}>{valueOf(a + i)}</Tag>),
        <Tag key={`${key}${label}`} className="msc-tot">
          {totalOf(a, b, label)}
        </Tag>,
      ]),
      ...(n > 9
        ? [
            <Tag key={`${key}all`} className="msc-tot">
              {totalOf(0, n, 'Tot')}
            </Tag>,
          ]
        : []),
    ];
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
        <MatchCard names={match.names} status={match.status} label={label} compact />
        <div className="msc-scroll">
          <table className="msc">
            <thead>
              <tr>
                <th className="msc-name">Hole</th>
                {cells((h) => h + 1, (a, b, label) => label, 'h', true)}
              </tr>
            </thead>
            <tbody>
              <tr className="msc-par">
                <td className="msc-name">Par</td>
                {cells((h) => par[h], (a, b) => sum(par, a, b), 'p')}
              </tr>
              {rows.map((r) => (
                <tr key={r.key} className={`msc-player side-${r.side}`}>
                  <td className="msc-name">{r.name}</td>
                  {cells(
                    (h) => {
                      const g = r.scores[h];
                      const dots = net && r.strokes ? r.strokes[h] : 0;
                      return (
                        <span className={`pc-s ${cls(g, par[h])}`}>
                          {g ?? ''}
                          {dots > 0 && <i>{'•'.repeat(dots)}</i>}
                        </span>
                      );
                    },
                    (a, b) => sum(r.scores, a, b),
                    r.key,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint center">Swipe sideways for every hole.</p>
      </div>
    </div>
  );
}
