export default function Scorecard({ round, computed, onPickHole }) {
  const { holes } = round.course;
  const nines = [
    [0, 9, 'Out'],
    [9, 18, 'In'],
  ];
  const total = (arr, from, to) => {
    let s = 0;
    for (let h = from; h < to; h++) if (arr[h] != null) s += arr[h];
    return s;
  };
  return (
    <div className="scorecard-wrap">
      {nines.map(([from, to, label]) => (
        <table key={label} className="scorecard">
          <thead>
            <tr>
              <th>Hole</th>
              {holes.slice(from, to).map((_, i) => (
                <th key={i}>
                  <button className="link" onClick={() => onPickHole(from + i + 1)}>
                    {from + i + 1}
                  </button>
                </th>
              ))}
              <th>{label}</th>
            </tr>
            <tr className="par-row">
              <td>Par</td>
              {holes.slice(from, to).map((h, i) => (
                <td key={i}>{h.par}</td>
              ))}
              <td>{total(holes.map((h) => h.par), from, to)}</td>
            </tr>
          </thead>
          <tbody>
            {round.players.map((p) => {
              const scores = round.scores[p.id];
              return (
                <tr key={p.id}>
                  <td className="sc-name">{p.name}</td>
                  {scores.slice(from, to).map((s, i) => {
                    const h = from + i;
                    const diff = s == null ? null : s - holes[h].par;
                    const strokes = computed.strokes[p.id][h];
                    return (
                      <td key={i} className={diff == null ? '' : diff < 0 ? 'under' : diff > 0 ? 'over' : ''}>
                        {s ?? ''}
                        {strokes > 0 && <sup>{'•'.repeat(strokes)}</sup>}
                      </td>
                    );
                  })}
                  <td className="sc-total">{total(scores, from, to) || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
      <p className="hint">
        Dots = handicap strokes. Playing handicaps:{' '}
        {round.players.map((p) => `${p.name} ${computed.playing[p.id]}`).join(', ')}.
        Totals: {round.players.map((p) => `${p.name} ${total(round.scores[p.id], 0, 18)}`).join(', ')}.
      </p>
    </div>
  );
}
