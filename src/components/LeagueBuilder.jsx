import { useState } from 'react';
import {
  defaultLeagueSettings,
  describeLeague,
  normalizeSettings,
  scoringOptions,
  seasonOptions,
  SCORING,
  SEASONS,
  UNITS,
} from '../lib/league/format.js';
import { OptionCards, Seg, Toggle } from './controls.jsx';

const numberOrNull = (text) => {
  const n = Number(String(text).trim());
  return String(text).trim() === '' || !Number.isFinite(n) ? null : n;
};

// Create a league (league = null) or edit an existing league's format.
// onSave({ name, settings }) may throw; its message is shown.
export default function LeagueBuilder({ league, onSave, onCancel }) {
  const [name, setName] = useState(league?.name ?? '');
  const [s, setS] = useState(() => normalizeSettings({ ...defaultLeagueSettings(), ...(league?.settings ?? {}) }));
  const [pointsText, setPointsText] = useState(() => s.pointsTable.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setS((prev) => normalizeSettings({ ...prev, ...patch }));
  const setH = (patch) => setS((prev) => ({ ...prev, handicap: { ...prev.handicap, ...patch } }));

  async function save() {
    if (!name.trim()) return setError('Give the league a name.');
    const table = pointsText
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (s.season === 'points' && (table.length === 0 || table.some((n) => !Number.isFinite(n) || n < 0)))
      return setError('Points by finish should be numbers like 25, 20, 16.');
    if (s.unit === 'ryder' && (!s.sides[0].trim() || !s.sides[1].trim() || s.sides[0].trim() === s.sides[1].trim()))
      return setError('Give the two sides different names.');
    setBusy(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        settings: { ...s, pointsTable: table.length ? table : s.pointsTable, sides: s.sides.map((x) => x.trim()) },
      });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onCancel}>
          ‹ Back
        </button>
        <h1>{league ? 'League format' : 'New league'}</h1>
        <span />
      </div>

      <section className="card">
        <label className="field">
          <span>League name</span>
          <input value={name} placeholder="e.g. Tuesday Night League" onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="hint">{describeLeague(s)}</p>
      </section>

      <section className="card">
        <h2>1. Who plays</h2>
        <OptionCards value={s.unit} options={UNITS} onChange={(unit) => set({ unit })} />
        {s.unit === 'teams' && (
          <>
            <p className="hint">Players per team</p>
            <Seg value={s.teamSize} options={[[2, '2-player teams'], [4, '4-player teams']]} onChange={(teamSize) => set({ teamSize })} />
          </>
        )}
        {s.unit === 'ryder' && (
          <div className="row2">
            {[0, 1].map((i) => (
              <label key={i} className="field">
                <span>Side {i + 1}</span>
                <input
                  value={s.sides[i]}
                  onChange={(e) => set({ sides: s.sides.map((x, j) => (j === i ? e.target.value : x)) })}
                />
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>2. How each round is scored</h2>
        <OptionCards value={s.scoring} options={SCORING} only={scoringOptions(s.unit)} onChange={(scoring) => set({ scoring })} />
        <Seg value={s.net} options={[[true, 'Net (handicaps)'], [false, 'Gross']]} onChange={(net) => set({ net })} />
        {s.unit === 'teams' && s.scoring !== 'match' && (
          <>
            <p className="hint">Team score each hole</p>
            <Seg
              value={s.teamScore}
              options={[
                ['bestBall', 'Best ball'],
                ['aggregate', 'All balls count'],
              ]}
              onChange={(teamScore) => set({ teamScore })}
            />
          </>
        )}
        {s.scoring === 'match' && s.unit !== 'individual' && (
          <p className="hint">
            {s.unit === 'ryder'
              ? 'Each round you set the matches: singles (1 vs 1) or four-ball (2 vs 2, best ball).'
              : 'Teams play best ball against another team each round.'}
          </p>
        )}
      </section>

      <section className="card">
        <h2>3. Season</h2>
        <OptionCards
          value={s.season}
          options={SEASONS}
          only={seasonOptions(s.unit, s.scoring)}
          onChange={(season) => set({ season })}
        />
        {s.season === 'points' && (
          <label className="field">
            <span>Points by finish (1st, 2nd, 3rd…)</span>
            <input value={pointsText} onChange={(e) => setPointsText(e.target.value)} />
          </label>
        )}
        {(s.season === 'points' || s.season === 'cumulative') && (
          <label className="field">
            <span>Count only the best weeks</span>
            <select value={s.bestOf ?? ''} onChange={(e) => set({ bestOf: numberOrNull(e.target.value) })}>
              <option value="">Every week counts</option>
              {[4, 5, 6, 8, 10, 12, 15].map((n) => (
                <option key={n} value={n}>
                  Best {n} weeks
                </option>
              ))}
            </select>
          </label>
        )}
        {s.season === 'record' && (
          <div className="row3">
            {['win', 'tie', 'loss'].map((k) => (
              <label key={k} className="field">
                <span>Points for a {k}</span>
                <input
                  inputMode="decimal"
                  value={s.record[k]}
                  onChange={(e) => set({ record: { ...s.record, [k]: numberOrNull(e.target.value) ?? 0 } })}
                />
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>4. Handicaps</h2>
        {!s.net && <p className="hint">Gross scoring ignores handicaps, but they&apos;re kept for later.</p>}
        <OptionCards
          value={s.handicap.mode}
          options={{
            index: { label: "Each player's own index", help: 'Uses the index on their profile (GHIN once connected).' },
            league: {
              label: 'League handicap',
              help: 'Worked out from league rounds: average of the best scores of their recent rounds. New players use their own index until they have enough rounds.',
            },
          }}
          onChange={(mode) => setH({ mode })}
        />
        {s.handicap.mode === 'league' && (
          <div className="row3">
            <label className="field">
              <span>Best</span>
              <input inputMode="numeric" value={s.handicap.best} onChange={(e) => setH({ best: numberOrNull(e.target.value) ?? 1 })} />
            </label>
            <label className="field">
              <span>of last</span>
              <input inputMode="numeric" value={s.handicap.of} onChange={(e) => setH({ of: numberOrNull(e.target.value) ?? 1 })} />
            </label>
            <label className="field">
              <span>Rounds needed</span>
              <input
                inputMode="numeric"
                value={s.handicap.minRounds}
                onChange={(e) => setH({ minRounds: numberOrNull(e.target.value) ?? 1 })}
              />
            </label>
          </div>
        )}
        <div className="row2">
          <label className="field">
            <span>Allowance</span>
            <select value={s.handicap.allowance} onChange={(e) => setH({ allowance: Number(e.target.value) })}>
              {[100, 95, 90, 85, 80, 75].map((a) => (
                <option key={a} value={a}>
                  {a}%
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Max handicap</span>
            <input
              inputMode="numeric"
              placeholder="No max"
              value={s.handicap.maxHandicap ?? ''}
              onChange={(e) => setH({ maxHandicap: numberOrNull(e.target.value) })}
            />
          </label>
        </div>
        {s.scoring === 'match' && (
          <Toggle
            label="Strokes off the low player in each match"
            checked={s.handicap.offLow}
            onChange={(offLow) => setH({ offLow })}
          />
        )}
      </section>

      {error && <div className="card error-box">{error}</div>}
      <button className="btn btn-primary btn-xl" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : league ? 'Save format' : 'Create league'}
      </button>
    </div>
  );
}
