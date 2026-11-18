import { MATCH_FORMATS } from '../lib/league/event.js';

// Stretches of holes for a split round: each one's last hole and format
// (the next stretch starts on the following hole; the last ends on hole n).
// formats: which formats a stretch may use (default: all match formats).
export default function SplitEditor({ segs, n, onChange, formats = Object.keys(MATCH_FORMATS), hint }) {
  const set = (i, patch) => {
    const next = segs.map((x, j) => (j === i ? { ...x, ...patch } : { ...x }));
    // Keep the stretches joined up: each starts after the one before.
    for (let j = 1; j < next.length; j++) next[j].from = next[j - 1].to + 1;
    next[next.length - 1].to = n;
    onChange(next);
  };
  const add = () => {
    const last = segs[segs.length - 1];
    if (last.to - last.from < 1) return;
    const mid = Math.floor((last.from + last.to) / 2);
    onChange([...segs.slice(0, -1), { ...last, to: mid }, { from: mid + 1, to: n, format: 'singles' }]);
  };
  const remove = (i) => {
    const next = segs.filter((_, j) => j !== i).map((x) => ({ ...x }));
    next[0].from = 1;
    for (let j = 1; j < next.length; j++) next[j].from = next[j - 1].to + 1;
    next[next.length - 1].to = n;
    onChange(next);
  };
  // One-tap shapes: front 9 / back 9, or three 6-hole stretches. Keeps the
  // formats already picked, in order.
  const preset = (parts) => {
    const size = Math.floor(n / parts);
    onChange(
      Array.from({ length: parts }, (_, i) => ({
        from: i * size + 1,
        to: i === parts - 1 ? n : (i + 1) * size,
        format: segs[i]?.format ?? segs[segs.length - 1].format,
      })),
    );
  };
  const shape = (parts) => segs.length === parts && segs.every((x, i) => x.from === i * Math.floor(n / parts) + 1);
  return (
    <div className="split-editor">
      <p className="hint">{hint ?? 'Each stretch is its own match and point. A singles stretch is two matches (first vs first, second vs second).'}</p>
      {n >= 6 && (
        <div className="chips split-presets">
          <button className={`chip ${shape(2) ? 'on' : ''}`} onClick={() => preset(2)}>
            Front {Math.floor(n / 2)} / back {n - Math.floor(n / 2)}
          </button>
          <button className={`chip ${shape(3) ? 'on' : ''}`} onClick={() => preset(3)}>
            Three {Math.floor(n / 3)}s
          </button>
        </div>
      )}
      {segs.map((x, i) => (
        <div key={i} className="split-row">
          <span className="split-holes">
            Holes {x.from}–
            {i === segs.length - 1 ? (
              x.to
            ) : (
              <select value={x.to} onChange={(e) => set(i, { to: Number(e.target.value) })} aria-label={`Stretch ${i + 1} last hole`}>
                {Array.from({ length: n - x.from - (segs.length - 1 - i) + 1 }, (_, k) => x.from + k).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            )}
          </span>
          <select value={x.format} onChange={(e) => set(i, { format: e.target.value })} aria-label={`Stretch ${i + 1} format`}>
            {formats.map((k) => [k, MATCH_FORMATS[k]]).map(([k, f]) => (
              <option key={k} value={k}>
                {f.size === 1 ? 'Singles · 1 vs 1' : `${f.short} · 2 vs 2`}
              </option>
            ))}
          </select>
          {segs.length > 2 && (
            <button className="btn btn-ghost btn-small" onClick={() => remove(i)} aria-label={`Remove stretch ${i + 1}`}>
              ✕
            </button>
          )}
        </div>
      ))}
      {segs.length < 6 && segs[segs.length - 1].to - segs[segs.length - 1].from >= 1 && (
        <button className="link small-link" onClick={add}>
          + Add a stretch
        </button>
      )}
    </div>
  );
}
