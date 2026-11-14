import { useState } from 'react';
import {
  describeLeague,
  leagueSettings,
  MAJOR_MULTIPLIERS,
  normalizeSettings,
  placesFor,
  POINT_PRESETS,
  scoringOptions,
  tableForTier,
  seasonOptions,
  SCORING,
  SEASONS,
  UNITS,
} from '../lib/league/format.js';
import { OptionCards, Seg, Toggle } from './controls.jsx';
import StablefordScoring from './StablefordScoring.jsx';

const numberOrNull = (text) => {
  const n = Number(String(text).trim());
  return String(text).trim() === '' || !Number.isFinite(n) ? null : n;
};

// Create a league (league = null) or edit an existing league's format.
// onSave({ name, settings }) may throw; its message is shown.
export default function LeagueBuilder({ league, kind: newKind = 'league', onSave, onCancel, onDelete }) {
  const [name, setName] = useState(league?.name ?? '');
  const [s, setS] = useState(() => leagueSettings(league?.settings ?? { kind: newKind }));
  const isTournament = s.kind === 'tournament';
  const noun = isTournament ? 'tournament' : 'league';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setS((prev) => normalizeSettings({ ...prev, ...patch }));
  const setH = (patch) => setS((prev) => ({ ...prev, handicap: { ...prev.handicap, ...patch } }));

  async function save() {
    if (!name.trim()) return setError(`Give the ${noun} a name.`);
    if (s.season === 'points' && !s.pointsTable.some((n) => n > 0)) return setError('Give at least 1st place some points.');
    if (s.unit === 'ryder' && (!s.sides[0].trim() || !s.sides[1].trim() || s.sides[0].trim() === s.sides[1].trim()))
      return setError('Give the two sides different names.');
    setBusy(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        settings: { ...s, sides: s.sides.map((x) => x.trim()) },
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
        <h1>{league ? (isTournament ? 'Tournament format' : 'League format') : isTournament ? 'New tournament' : 'New league'}</h1>
        <span />
      </div>

      <section className="card">
        <label className="field">
          <span>{isTournament ? 'Tournament name' : 'League name'}</span>
          <input
            value={name}
            placeholder={isTournament ? 'e.g. Member-Guest 2027' : 'e.g. Tuesday Night League'}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="hint">{describeLeague(s)}</p>
      </section>

      <section className="card">
        <h2>1. Who plays</h2>
        <OptionCards value={s.unit} options={UNITS} onChange={(unit) => set({ unit })} />
        <div className="count-row">
          <div>
            <strong>How many players?</strong>
            <span className="muted">
              {s.unit === 'teams'
                ? `${placesFor(s)} teams of ${s.teamSize}`
                : s.unit === 'ryder'
                  ? `About ${Math.ceil(s.fieldSize / 2)} a side`
                  : 'Sets how many places earn points'}
            </span>
          </div>
          <div className="stepper">
            <button type="button" className="step" aria-label="Fewer players" onClick={() => set({ fieldSize: Math.max(2, s.fieldSize - 1) })}>
              −
            </button>
            <input
              className="count-input"
              inputMode="numeric"
              aria-label="Number of players"
              value={s.fieldSize}
              onChange={(e) => set({ fieldSize: Math.min(200, Math.max(2, Number(e.target.value.replace(/\D/g, '')) || 2)) })}
            />
            <button type="button" className="step" aria-label="More players" onClick={() => set({ fieldSize: Math.min(200, s.fieldSize + 1) })}>
              +
            </button>
          </div>
        </div>
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
        <OptionCards value={s.scoring} options={SCORING} only={scoringOptions(s.unit, s.kind)} onChange={(scoring) => set({ scoring })} />
        <Seg value={s.net} options={[[true, 'Net (handicaps)'], [false, 'Gross']]} onChange={(net) => set({ net })} />
        {s.scoring === 'stableford' && (
          <StablefordScoring value={s.stableford} net={s.net} onChange={(stableford) => set({ stableford })} />
        )}
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

      {isTournament ? (
        <section className="card">
          <h2>3. Rounds</h2>
          <div className="count-row first">
            <div>
              <strong>How many rounds?</strong>
              <span className="muted">{s.rounds === 1 ? 'A one-day event' : `${s.rounds} rounds, totals add up`}</span>
            </div>
            <div className="stepper">
              <button type="button" className="step" aria-label="Fewer rounds" onClick={() => set({ rounds: s.rounds - 1 })}>
                −
              </button>
              <span className="count-value">{s.rounds}</span>
              <button type="button" className="step" aria-label="More rounds" onClick={() => set({ rounds: s.rounds + 1 })}>
                +
              </button>
            </div>
          </div>
          <p className="hint">
            {s.unit === 'ryder'
              ? 'Each round is a session of matches (singles or four-ball). Points add up across rounds, and the board shows every round plus the total, live.'
              : 'The leaderboard is live: every hole entered moves the standings, with each round and the total.'}{' '}
            You add each round&apos;s course and date after creating the tournament.
          </p>
        </section>
      ) : (
      <section className="card">
        <h2>3. Season</h2>
        <OptionCards
          value={s.season}
          options={SEASONS}
          only={seasonOptions(s.unit, s.scoring)}
          onChange={(season) => set({ season })}
        />
        {s.season === 'points' && <PointsTable s={s} set={set} />}
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
      )}

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
          only={isTournament ? ['index'] : undefined}
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
        {busy ? 'Saving…' : league ? 'Save format' : `Create ${noun}`}
      </button>

      {league && onDelete && (
        <section className="card danger-zone">
          <h3>Delete {noun}</h3>
          <p className="hint">
            Removes the {noun} for everyone: players, rounds, scores and standings. This can&apos;t be undone.
          </p>
          <button
            className="btn btn-ghost full danger"
            disabled={busy}
            onClick={async () => {
              const typed = prompt(`To delete "${league.name}" for everyone, type DELETE`);
              if (typed?.trim().toUpperCase() !== 'DELETE') return;
              setBusy(true);
              setError('');
              try {
                await onDelete();
              } catch (e) {
                setError(e.message);
                setBusy(false);
              }
            }}
          >
            Delete this {noun}
          </button>
        </section>
      )}
    </div>
  );
}

const ordinal = (n) => {
  const t = n % 100;
  const suffix = t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
};

// Points by finish: a preset, how much majors are worth, and one row per place.
function PointsTable({ s, set }) {
  const [showAll, setShowAll] = useState(false);
  const major = tableForTier(s, 'major');
  const rows = showAll ? s.pointsTable.length : Math.min(10, s.pointsTable.length);
  const setPlace = (i, text) => {
    const v = Math.max(0, Math.min(10000, Number(text.replace(/\D/g, '')) || 0));
    set({ pointsPreset: 'custom', pointsTable: s.pointsTable.map((p, j) => (j === i ? v : p)) });
  };
  return (
    <div className="points-setup">
      <p className="hint">
        Like the FedEx Cup: every round is a <strong>Regular</strong> event or a <strong>Major</strong>, and majors pay
        more. You choose which rounds are majors when you add them.
      </p>
      <p className="label">Points style</p>
      <Seg
        value={s.pointsPreset}
        options={Object.entries(POINT_PRESETS).map(([k, v]) => [k, v.label])}
        onChange={(pointsPreset) => set({ pointsPreset })}
      />
      <p className="hint">{POINT_PRESETS[s.pointsPreset].help}</p>
      <p className="label">Majors are worth</p>
      <Seg
        value={s.majorMultiplier}
        options={MAJOR_MULTIPLIERS.map((m) => [m, `${m}×`])}
        onChange={(majorMultiplier) => set({ majorMultiplier })}
      />
      <table className="points-table">
        <thead>
          <tr>
            <th>Finish</th>
            <th>Regular</th>
            <th>Major</th>
          </tr>
        </thead>
        <tbody>
          {s.pointsTable.slice(0, rows).map((p, i) => (
            <tr key={i}>
              <td>{ordinal(i + 1)}</td>
              <td>
                <input
                  inputMode="numeric"
                  aria-label={`Points for ${ordinal(i + 1)}`}
                  value={p}
                  onChange={(e) => setPlace(i, e.target.value)}
                />
              </td>
              <td className="muted">{major[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.pointsTable.length > 10 && (
        <button type="button" className="btn btn-ghost full" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show top 10' : `Show all ${s.pointsTable.length} places`}
        </button>
      )}
      <p className="hint">Ties split the points for the places they cover. Type in any box to make your own table.</p>
    </div>
  );
}
