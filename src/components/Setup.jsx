import { useEffect, useState } from 'react';
import {
  blankCourse,
  courseProblems,
  defaultSettings,
  gameAvailable,
  GAME_INFO,
  formatIndex,
  makeId,
  newRound,
  parseIndex,
  teamOptions,
} from '../lib/roundSetup.js';
import { listCourses, saveCourse } from '../lib/storage.js';
import CourseSearch from './CourseSearch.jsx';
import { Switch, Toggle } from './controls.jsx';
import StablefordScoring from './StablefordScoring.jsx';
import { listSavedPlayers } from '../lib/account.js';

const newPlayer = (from) => ({
  id: makeId(),
  name: from?.name ?? '',
  indexText: from?.index == null ? '' : formatIndex(from.index),
  savedId: from?.savedId ?? null,
});

export default function Setup({ profile, onStart, onCancel }) {
  const [courses, setCourses] = useState([]);
  const [course, setCourse] = useState(blankCourse);
  const [teeIdx, setTeeIdx] = useState(0);
  const [showHoles, setShowHoles] = useState(false);
  const [players, setPlayers] = useState(() => [newPlayer(profile), newPlayer()]);
  const [saved, setSaved] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [errors, setErrors] = useState([]);
  const [courseNotes, setCourseNotes] = useState([]);

  useEffect(() => {
    listSavedPlayers()
      .then(setSaved)
      .catch(() => {});
  }, []);

  useEffect(() => {
    listCourses()
      .then((list) => {
        setCourses(list);
        if (list[0]) setCourse(list[0]);
      })
      .catch(() => {});
  }, []);

  const tee = course.tees[teeIdx] ?? course.tees[0];
  const par = course.holes.reduce((s, h) => s + h.par, 0);
  const named = players.map((p, i) => ({ ...p, name: p.name.trim() || `Player ${i + 1}` }));
  const teams = teamOptions(named);

  const setTee = (field, value) =>
    setCourse((c) => ({ ...c, tees: c.tees.map((t, i) => (i === teeIdx ? { ...t, [field]: value } : t)) }));
  const setHole = (i, field, value) =>
    setCourse((c) => ({ ...c, holes: c.holes.map((h, j) => (j === i ? { ...h, [field]: value } : h)) }));
  const setPlayer = (i, field, value) =>
    setPlayers((ps) => ps.map((p, j) => (j === i ? { ...p, [field]: value } : p)));
  const setGame = (type, field, value) =>
    setSettings((s) => ({ ...s, [type]: { ...s[type], [field]: value } }));

  // Fill the first empty row with a saved player, or add a row.
  function addSaved(p) {
    const filled = newPlayer({ ...p, savedId: p.id });
    setPlayers((ps) => {
      const empty = ps.findIndex((x) => !x.name.trim());
      if (empty >= 0) return ps.map((x, i) => (i === empty ? { ...filled, id: x.id } : x));
      return ps.length < 4 ? [...ps, filled] : ps;
    });
  }

  function pickImported({ course: imported, warnings }) {
    // A course already saved on this phone keeps any fixes made to it.
    const saved = courses.find((c) => c.id === imported.id);
    setCourse(saved ?? imported);
    setTeeIdx(0);
    setCourseNotes(saved ? [] : warnings);
    setShowHoles(!saved && warnings.some((w) => /hole handicaps|pars/.test(w)));
  }

  function chooseCourse(c) {
    setCourse(c);
    setTeeIdx(0);
    setCourseNotes([]);
  }

  function addTee() {
    setCourse((c) => ({ ...c, tees: [...c.tees, { name: `Tee ${c.tees.length + 1}`, rating: 72, slope: 113 }] }));
    setTeeIdx(course.tees.length);
  }

  async function start() {
    const numericTee = { ...tee, rating: Number(tee.rating), slope: Number(tee.slope) };
    const problems = courseProblems(course, numericTee);
    const parsed = named.map((p) => ({ ...p, index: parseIndex(p.indexText) }));
    parsed.forEach((p) => {
      if (p.index === null) problems.push(`${p.name}: handicap index should be a number like 12.4 or +2.1.`);
    });
    setErrors(problems);
    if (problems.length) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const cleanCourse = {
      ...course,
      name: course.name.trim(),
      tees: course.tees.map((t) => ({ ...t, rating: Number(t.rating), slope: Number(t.slope) })),
    };
    await saveCourse(cleanCourse).catch(() => {});
    onStart(newRound({ course: cleanCourse, tee: numericTee, players: parsed, settings }));
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onCancel}>
          ‹ Back
        </button>
        <h1>New round</h1>
        <span />
      </div>

      {errors.length > 0 && (
        <div className="card error-box" role="alert">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      <section className="card">
        <h2>Course</h2>
        <CourseSearch onPick={pickImported} />
        {courses.length > 0 && (
          <div className="chips">
            {courses.map((c) => (
              <button
                key={c.id}
                className={`chip ${c.id === course.id ? 'on' : ''}`}
                onClick={() => chooseCourse(c)}
              >
                {c.name}
              </button>
            ))}
            <button
              className={`chip ${courses.every((c) => c.id !== course.id) ? 'on' : ''}`}
              onClick={() => chooseCourse(blankCourse())}
            >
              + New course
            </button>
          </div>
        )}
        {course.place && <p className="muted">{course.place}</p>}
        {courseNotes.length > 0 && (
          <div className="warn-box course-notes">
            {courseNotes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}
        <label className="field">
          <span>Course name</span>
          <input
            value={course.name}
            placeholder="e.g. Pine Valley"
            onChange={(e) => setCourse((c) => ({ ...c, name: e.target.value }))}
          />
        </label>
        <div className="chips">
          {course.tees.map((t, i) => (
            <button key={i} className={`chip ${i === teeIdx ? 'on' : ''}`} onClick={() => setTeeIdx(i)}>
              {t.name || `Tee ${i + 1}`}
            </button>
          ))}
          <button className="chip" onClick={addTee}>
            + Tee
          </button>
        </div>
        <div className="row3">
          <label className="field">
            <span>Tee</span>
            <input value={tee.name} onChange={(e) => setTee('name', e.target.value)} />
          </label>
          <label className="field">
            <span>Rating</span>
            <input inputMode="decimal" value={tee.rating} onChange={(e) => setTee('rating', e.target.value)} />
          </label>
          <label className="field">
            <span>Slope</span>
            <input inputMode="numeric" value={tee.slope} onChange={(e) => setTee('slope', e.target.value)} />
          </label>
        </div>
        <button className="btn btn-ghost full" onClick={() => setShowHoles((v) => !v)}>
          Par {par} · {showHoles ? 'Hide holes' : 'Edit pars & hole handicaps'}
        </button>
        {showHoles && (
          <table className="holes-table">
            <thead>
              <tr>
                <th>Hole</th>
                <th>Par</th>
                <th>Hcp</th>
              </tr>
            </thead>
            <tbody>
              {course.holes.map((h, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <div className="seg">
                      {[3, 4, 5].map((p) => (
                        <button key={p} className={h.par === p ? 'on' : ''} onClick={() => setHole(i, 'par', p)}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      className="hcp-input"
                      inputMode="numeric"
                      value={h.hcp}
                      onChange={(e) => setHole(i, 'hcp', Number(e.target.value.replace(/\D/g, '')) || 0)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Players</h2>
        {saved.length > 0 && (
          <div className="chips">
            {saved
              .filter((p) => !players.some((x) => x.savedId === p.id))
              .map((p) => (
                <button
                  key={p.id}
                  className="chip"
                  onClick={() => addSaved(p)}
                  disabled={players.length >= 4 && players.every((x) => x.name.trim())}
                >
                  + {p.name}
                </button>
              ))}
          </div>
        )}
        {players.map((p, i) => (
          <div className="player-row" key={p.id}>
            <input
              className="grow"
              value={p.name}
              placeholder={`Player ${i + 1}`}
              onChange={(e) => setPlayer(i, 'name', e.target.value)}
              aria-label={`Player ${i + 1} name`}
            />
            <input
              className="index-input"
              inputMode="decimal"
              value={p.indexText}
              placeholder="Index"
              onChange={(e) => setPlayer(i, 'indexText', e.target.value)}
              aria-label={`Player ${i + 1} handicap index`}
            />
            {players.length > 2 && (
              <button
                className="btn btn-ghost btn-small"
                onClick={() => setPlayers((ps) => ps.filter((_, j) => j !== i))}
                aria-label="Remove player"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {players.length < 4 && (
          <button className="btn btn-ghost full" onClick={() => setPlayers((ps) => [...ps, newPlayer()])}>
            + Add player
          </button>
        )}
        <p className="hint">Handicap index from your app or card. Plus handicap? Type +2.1.</p>
        <div className="row2">
          <label className="field">
            <span>Handicap allowance</span>
            <select
              value={settings.handicap.allowance}
              onChange={(e) =>
                setSettings((s) => ({ ...s, handicap: { ...s.handicap, allowance: Number(e.target.value) } }))
              }
            >
              {[100, 95, 90, 85, 80, 75].map((a) => (
                <option key={a} value={a}>
                  {a}%
                </option>
              ))}
            </select>
          </label>
          <Toggle
            label="Strokes off the low man"
            checked={settings.handicap.offLow}
            onChange={(v) => setSettings((s) => ({ ...s, handicap: { ...s.handicap, offLow: v } }))}
          />
        </div>
      </section>

      {teams.length > 0 && (
        <section className="card">
          <h2>Teams</h2>
          <p className="hint">Used for team Nassau, match play, Stableford and Vegas.</p>
          <div className="stack">
            {teams.map(([a, b], i) => (
              <button
                key={i}
                className={`option ${settings.teamsIndex === i ? 'on' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, teamsIndex: i }))}
              >
                {names(named, a)} <em>vs</em> {names(named, b)}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>Games</h2>
        {Object.keys(GAME_INFO).map((type) => {
          const available = gameAvailable(type, players.length);
          const s = settings[type];
          return (
            <div key={type} className={`game ${s.on && available ? 'on' : ''} ${available ? '' : 'disabled'}`}>
              <div className="game-head">
                <div>
                  <strong>{GAME_INFO[type].name}</strong>
                  {!available && <span className="muted"> · needs 4 players</span>}
                </div>
                <Switch
                  label={`Play ${GAME_INFO[type].name}`}
                  checked={s.on && available}
                  disabled={!available}
                  onChange={(v) => setGame(type, 'on', v)}
                />
              </div>
              {s.on && available && (
                <div className="game-body">
                  <p className="rules">{GAME_INFO[type].rules}</p>
                  <GameOptions type={type} s={s} set={(f, v) => setGame(type, f, v)} playerCount={players.length} />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <button className="btn btn-primary btn-xl sticky-bottom" onClick={start}>
        Tee off
      </button>
    </div>
  );
}

function names(players, ids) {
  return ids.map((id) => players.find((p) => p.id === id)?.name).join(' & ');
}

function GameOptions({ type, s, set, playerCount }) {
  const stakeLabel = {
    nassau: 'Per bet (front / back / 18)',
    skins: 'Per skin, from each player',
    match: 'Per match',
    stroke: s.mode === 'perStroke' ? 'Per stroke' : 'Per player you beat',
    stableford:
      s.mode === 'perPoint'
        ? 'Per point'
        : s.format === 'teams' && playerCount === 4
          ? 'Per player, to the winning team'
          : 'Per player you beat',
    wolf: 'Per hole',
    vegas: 'Per point',
  }[type];
  return (
    <div className="options">
      <label className="field money">
        <span>{stakeLabel}</span>
        <div className="money-input">
          <span>$</span>
          <input inputMode="decimal" value={s.stake} onChange={(e) => set('stake', e.target.value)} />
        </div>
      </label>
      <div className="seg wide">
        <button className={s.net ? 'on' : ''} onClick={() => set('net', true)}>
          Net
        </button>
        <button className={!s.net ? 'on' : ''} onClick={() => set('net', false)}>
          Gross
        </button>
      </div>
      {(type === 'nassau' || type === 'match') && playerCount === 4 && (
        <div className="seg wide">
          <button className={s.format === 'teams' ? 'on' : ''} onClick={() => set('format', 'teams')}>
            2 vs 2 teams
          </button>
          <button className={s.format === 'each' ? 'on' : ''} onClick={() => set('format', 'each')}>
            Everyone vs everyone
          </button>
        </div>
      )}
      {type === 'nassau' && (
        <label className="field">
          <span>Auto press</span>
          <select value={s.autoPress} onChange={(e) => set('autoPress', Number(e.target.value))}>
            <option value={0}>Off (manual presses only)</option>
            <option value={2}>When 2 down</option>
            <option value={3}>When 3 down</option>
          </select>
        </label>
      )}
      {type === 'skins' && (
        <>
          <Toggle label="Carryovers" checked={s.carryover} onChange={(v) => set('carryover', v)} />
          <Toggle
            label="Validate (winner must tie or win the next hole)"
            checked={s.validate}
            onChange={(v) => set('validate', v)}
          />
        </>
      )}
      {type === 'stroke' && (
        <div className="seg wide">
          <button className={s.mode === 'perOpponent' ? 'on' : ''} onClick={() => set('mode', 'perOpponent')}>
            Per player beaten
          </button>
          <button className={s.mode === 'perStroke' ? 'on' : ''} onClick={() => set('mode', 'perStroke')}>
            Per stroke
          </button>
        </div>
      )}
      {type === 'stableford' && (
        <>
          {playerCount === 4 && (
            <div className="seg wide">
              <button className={s.format === 'each' ? 'on' : ''} onClick={() => set('format', 'each')}>
                Every player
              </button>
              <button className={s.format === 'teams' ? 'on' : ''} onClick={() => set('format', 'teams')}>
                2 vs 2 teams
              </button>
            </div>
          )}
          {s.format === 'teams' && playerCount === 4 && (
            <>
              <div className="seg wide">
                <button className={s.teamScore === 'bestBall' ? 'on' : ''} onClick={() => set('teamScore', 'bestBall')}>
                  Best ball
                </button>
                <button className={s.teamScore === 'aggregate' ? 'on' : ''} onClick={() => set('teamScore', 'aggregate')}>
                  Both balls count
                </button>
              </div>
              <p className="hint">Teams are the ones picked above.</p>
            </>
          )}
          <div className="seg wide">
            <button className={s.mode === 'perPoint' ? 'on' : ''} onClick={() => set('mode', 'perPoint')}>
              Per point
            </button>
            <button className={s.mode === 'perOpponent' ? 'on' : ''} onClick={() => set('mode', 'perOpponent')}>
              {s.format === 'teams' && playerCount === 4 ? 'Winner takes stake' : 'Per player beaten'}
            </button>
          </div>
          <StablefordScoring value={s.scoring} net={s.net} onChange={(v) => set('scoring', v)} />
        </>
      )}
      {type === 'wolf' && (
        <p className="hint">Wolf order is the player order above. Lone wolf 2×, blind wolf 3×.</p>
      )}
      {type === 'vegas' && (
        <Toggle label="Birdie flips the other team" checked={s.birdieFlip} onChange={(v) => set('birdieFlip', v)} />
      )}
    </div>
  );
}
