import { useRef, useState } from 'react';

// Small, single-series SVG charts for the owner dashboard: thin marks,
// recessive grid, hover tooltip. points: [{ x: label, y: number }].

const W = 640;
const H = 220;
const PAD = { l: 40, r: 12, t: 12, b: 26 };

function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function useHover(n) {
  const ref = useRef(null);
  const [i, setI] = useState(null);
  const onMove = (e) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !n) return;
    const x = ((e.clientX - box.left) / box.width) * W;
    const t = (x - PAD.l) / (W - PAD.l - PAD.r);
    setI(Math.max(0, Math.min(n - 1, Math.round(t * (n - 1)))));
  };
  return { ref, i, onMove, onLeave: () => setI(null) };
}

function Axes({ max, ticks, labels }) {
  const ih = H - PAD.t - PAD.b;
  return (
    <g className="ad-axes">
      {[0, 0.5, 1].map((f) => {
        const y = PAD.t + ih - f * ih;
        return (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} className="ad-grid" />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end">
              {Math.round(max * f).toLocaleString()}
            </text>
          </g>
        );
      })}
      {ticks.map(([x, label], k) => (
        // First and last labels hug the edges so they're never cut off.
        <text key={label + x} x={x} y={H - 6} textAnchor={k === 0 && ticks.length > 1 ? 'start' : k === ticks.length - 1 && ticks.length > 1 ? 'end' : 'middle'}>
          {label}
        </text>
      ))}
      {labels}
    </g>
  );
}

const tickIdx = (n, k = 5) => (n <= 1 ? [0] : Array.from({ length: k }, (_, j) => Math.round((j * (n - 1)) / (k - 1))));

// Line (with a light area) for things over time.
export function LineChart({ points, label, format = (p) => p.x }) {
  const n = points.length;
  const max = niceMax(Math.max(1, ...points.map((p) => p.y)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const X = (i) => PAD.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => PAD.t + ih - (v / max) * ih;
  const hover = useHover(n);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = n ? `${line}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z` : '';
  const h = hover.i != null ? points[hover.i] : null;
  return (
    <div className="ad-chart">
      <svg ref={hover.ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onMouseMove={hover.onMove} onMouseLeave={hover.onLeave}>
        <Axes max={max} ticks={tickIdx(n).map((i) => [X(i), format(points[i] ?? { x: '' })])} />
        <path d={area} className="ad-area" />
        <path d={line} className="ad-line" />
        {h && (
          <g>
            <line x1={X(hover.i)} x2={X(hover.i)} y1={PAD.t} y2={Y(0)} className="ad-cross" />
            <circle cx={X(hover.i)} cy={Y(h.y)} r={5} className="ad-dot" />
          </g>
        )}
      </svg>
      {h && (
        <div className="ad-tip" style={{ left: `${(X(hover.i) / W) * 100}%` }}>
          <strong>{h.y.toLocaleString()}</strong>
          <span>{format(h)}</span>
        </div>
      )}
    </div>
  );
}

// Bars for counts per period.
export function BarChart({ points, label, format = (p) => p.x }) {
  const n = points.length;
  const max = niceMax(Math.max(1, ...points.map((p) => p.y)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(1, n);
  const bw = Math.max(2, slot - 2);
  const X = (i) => PAD.l + i * slot;
  const Y = (v) => PAD.t + ih - (v / max) * ih;
  const hover = useHover(n);
  const h = hover.i != null ? points[hover.i] : null;
  return (
    <div className="ad-chart">
      <svg ref={hover.ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onMouseMove={hover.onMove} onMouseLeave={hover.onLeave}>
        <Axes max={max} ticks={tickIdx(n).map((i) => [X(i) + bw / 2, format(points[i] ?? { x: '' })])} />
        {points.map((p, i) => {
          const y = Y(p.y);
          const hgt = Y(0) - y;
          return (
            <path
              key={p.x}
              className={`ad-bar ${hover.i === i ? 'on' : ''}`}
              d={hgt <= 0 ? '' : `M${X(i)},${Y(0)}V${y + Math.min(4, hgt)}a4,4 0 0 1 4,-4H${X(i) + bw - 4}a4,4 0 0 1 4,4V${Y(0)}Z`}
            />
          );
        })}
      </svg>
      {h && (
        <div className="ad-tip" style={{ left: `${((X(hover.i) + bw / 2) / W) * 100}%` }}>
          <strong>{h.y.toLocaleString()}</strong>
          <span>{format(h)}</span>
        </div>
      )}
    </div>
  );
}

// Tiny trend line for a table row.
export function Sparkline({ points }) {
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...points.map((p) => p.y));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, points.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - (p.y / max) * (h - 6)).toFixed(1)}`).join('');
  return (
    <svg className="ad-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
