import {
  BONUS_RESULTS,
  normalizeScoring,
  STABLEFORD_PRESETS,
  STABLEFORD_RESULTS,
} from '../lib/games/stableford.js';
import { Seg, Toggle } from './controls.jsx';

function PointStepper({ value, onChange, label }) {
  return (
    <div className="mini-stepper">
      <button type="button" aria-label={`${label} minus one`} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className={value < 0 ? 'down' : value > 0 ? 'up' : ''}>{value > 0 ? `+${value}` : value}</span>
      <button type="button" aria-label={`${label} plus one`} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

// Stableford points per result, plus bonuses for natural (no-stroke) scores.
// value: a scoring object (see games/stableford.js); net: scored on net score.
export default function StablefordScoring({ value, net, onChange }) {
  const sf = normalizeScoring(value);
  const setSf = (patch) => onChange(normalizeScoring({ ...sf, ...patch }));
  const setPoint = (key, v) =>
    setSf({ preset: 'custom', points: { ...sf.points, [key]: Math.max(-20, Math.min(20, v)) } });
  const setBonus = (key, v) => setSf({ bonus: { ...sf.bonus, [key]: Math.max(0, Math.min(20, v)) } });
  return (
    <div className="points-setup">
      <p className="label">Stableford points</p>
      <Seg
        value={sf.preset}
        options={Object.entries(STABLEFORD_PRESETS).map(([k, v]) => [k, v.label])}
        onChange={(preset) => setSf({ preset })}
      />
      <p className="hint">{STABLEFORD_PRESETS[sf.preset].help}</p>
      <table className="points-table">
        <tbody>
          {STABLEFORD_RESULTS.map(([key, label]) => (
            <tr key={key}>
              <td>{label}</td>
              <td>
                <PointStepper label={label} value={sf.points[key]} onChange={(v) => setPoint(key, v)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        {net ? 'Scored on net score (after handicap strokes).' : 'Scored on gross score.'} Change any row to make your
        own.
      </p>

      <Toggle
        label="Bonus points for natural scores"
        checked={sf.bonusOn}
        onChange={(bonusOn) => setSf({ bonusOn })}
      />
      {sf.bonusOn && (
        <>
          <p className="hint">
            Extra points for a real birdie or better, without handicap strokes, on top of the Stableford points. A
            net birdie made with a stroke doesn&apos;t count.
          </p>
          <table className="points-table">
            <tbody>
              {BONUS_RESULTS.map(([key, label]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td>
                    <PointStepper label={label} value={sf.bonus[key]} onChange={(v) => setBonus(key, v)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">A hole-in-one gets the hole-in-one bonus instead of the eagle or albatross bonus.</p>
        </>
      )}
    </div>
  );
}
