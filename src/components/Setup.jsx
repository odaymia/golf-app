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
  usesTeams,
  gameLimitText,
  MAX_PLAYERS,
} from '../lib/roundSetup.js';
import { listCourses, saveCourse } from '../lib/storage.js';
import CourseSearch from './CourseSearch.jsx';
import { Switch, Toggle } from './controls.jsx';
import StablefordScoring from './StablefordScoring.jsx';
import { listSavedPlayers } from '../lib/account.js';
import PlayerSearch from './PlayerSearch.jsx';

// "Blue · 6,850 yds · 72.4/131" for the tee dropdown.
const teeLabel = (t, i) =>
  [t.name || `Tee ${i + 1}`, t.yards ? `${Number(t.yards).toLocaleString()} yds` : null, `${t.rating}/${t.slope}`].filter(Boolean).join(' · ');

const newPlayer = (from) => ({
  id: makeId(),
  name: from?.name ?? '',
  indexText: from?.index == null ? '' : formatIndex(from.index),
  savedId: from?.savedId ?? null,
  userId: from?.userId ?? null,
});

export default function Setup({ profile, meId, onStart, onCancel }) {
  const [courses, setCourses] = useState([]);
  const [course, setCourse] = useState(blankCourse);
  const [teeIdx, setTeeIdx] = useState(0);
  const [showHoles, setShowHoles] = useState(false);
  const [editTee, setEditTee] = useState(false);
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
      })
      .catch(() => {});
  }, []);

  const tee = course.tees[teeIdx] ?? course.tees[0];
  const par = course.holes.reduce((s, h) => s + h.par, 0);
  const named = players.map((p, i) => ({ ...p, name: p.name.trim() || `Player ${i + 1}` }));
  const teams = teamOptions(named);
  const showTeams = teams.length > 0 && usesTeams(settings, players.length);

  const setTee = (field, value) =>
    setCourse((c) => ({ ...c, tees: c.tees.map((t, i) => (i === teeIdx ? { ...t, [field]: value } : t)) }));
  const setHole = (i, field, value) =>
    setCourse((c) => ({ ...c, holes: c.holes.map((h, j) => (j === i ? { ...h, [field]: value } : h)) }));
  const setPlayer = (i, field, value) =>
    setPlayers((ps) => ps.map((p, j) => (j === i ? { ...p, [field]: value } : p)));
  // Grow or shrink the player list (new rows are blank; extra rows come off the bottom).
  function setCount(n) {
    setPlayers((ps) => {
      if (n > ps.length) return [...ps, ...Array.from({ length: n - ps.length }, () => newPlayer())];
      const cut = ps.slice(n).filter((p) => p.name.trim());
      if (cut.length && !confirm(`Remove ${cut.map((p) => p.name).join(', ')}?`)) return ps;
      return ps.slice(0, n);
    });
  }
  const setGame = (type, field, value) =>
    setSettings((s) => ({ ...s, [type]: { ...s[type], [field]: value } }));

  // Fill the first empty row with a saved player, or add a row.
  function addSaved(p) {
    const filled = newPlayer({ ...p, savedId: p.id });
    setPlayers((ps) => {
      const empty = ps.findIndex((x) => !x.name.trim());
      if (empty >= 0) return ps.map((x, i) => (i === empty ? { ...filled, id: x.id } : x));
      return ps.length < MAX_PLAYERS ? [...ps, filled] : ps;
    });
  }

  function pickImported({ course: imported, warnings }) {
    // A course already saved on this phone keeps any fixes made to it.
    const saved = courses.find((c) => c.id === imported.id);
    setCourse(saved ?? imported);
    setTeeIdx(0);
    setEditTee(false);
    setErrors([]);
    setCourseNotes(saved ? [] : warnings);
    setShowHoles(!saved && warnings.some((w) => /hole handicaps|pars/.test(w)));
  }

  function chooseCourse(c) {
    setCourse(c);
    setTeeIdx(0);
    setEditTee(false);
    setCourseNotes([]);
    setErrors([]);
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
        <CourseSearch
          onPick={pickImported}
          recent={courses}
          onPickRecent={chooseCourse}
          onCustom={(name) => chooseCourse({ ...blankCourse(), name })}
        />
        {course.name.trim() && (
          <p className="course-picked">
            <span>
              <strong>{course.name}</strong>
              {course.place && <span className="muted"> · {course.place}</span>}
            </span>
            <button className="link small-link" onClick={() => chooseCourse(blankCourse())}>
              Clear
            </button>
          </p>
        )}
        {courseNotes.length > 0 && (
          <div className="warn-box course-notes">
            {courseNotes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}
        <label className="field">
          <span>Tees</span>
          <select
            value={teeIdx}
            onChange={(e) => {
              if (e.target.value === 'add') {
                addTee();
                setEditTee(true);
              } else setTeeIdx(Number(e.target.value));
            }}
            aria-label="Tees you're playing"
          >
            {course.tees.map((t, i) => (
              <option key={i} value={i}>
                {teeLabel(t, i)}
              </option>
            ))}
            <option value="add">+ Add a tee…</option>
          </select>
        </label>
        {editTee || !String(course.id).startsWith('oga-') ? (
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
        ) : (
          <p className="tee-summary">
            <span>
              Rating <strong>{tee.rating}</strong> · Slope <strong>{tee.slope}</strong>
              {tee.yards ? ` · ${Number(tee.yards).toLocaleString()} yds` : ''}
            </span>
            <button className="link small-link" onClick={() => setEditTee(true)}>
              Edit tee
            </button>
          </p>
        )}
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
        <label className="field player-count">
          <span>How many players</span>
          <select value={players.length} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many players">
            {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} player{n === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        {players.length > 4 && (
          <p className="hint big-group">
            Everyone in this round is scored on this phone. Playing in several groups? A one-day tournament (from Home) lets each
            group score on its own phone, with a live leaderboard and side games.
          </p>
        )}
        {saved.length > 0 && (
          <div className="chips">
            {saved
              .filter((p) => !players.some((x) => x.savedId === p.id))
              .map((p) => (
                <button
                  key={p.id}
                  className="chip"
                  onClick={() => addSaved(p)}
                  disabled={players.length >= MAX_PLAYERS && players.every((x) => x.name.trim())}
                >
                  + {p.name}
                </button>
              ))}
          </div>
        )}
        {players.map((p, i) => (
          <div className="player-row" key={p.id}>
            <PlayerSearch
              value={p.name}
              placeholder={`Player ${i + 1}`}
              ariaLabel={`Player ${i + 1} name`}
              meId={meId}
              saved={saved}
              exclude={players.flatMap((x) => [x.savedId && `saved:${x.savedId}`, x.userId && `user:${x.userId}`]).filter(Boolean)}
              onChange={(name) =>
                // Editing the name by hand unlinks the picked golfer.
                setPlayers((ps) => ps.map((x, j) => (j === i ? { ...x, name, savedId: null, userId: null } : x)))
              }
              onPick={(picked) =>
                setPlayers((ps) =>
                  ps.map((x, j) =>
                    j === i
                      ? { ...x, name: picked.name, indexText: picked.index == null ? x.indexText : formatIndex(picked.index), savedId: picked.savedId, userId: picked.userId }
                      : x,
                  ),
                )
              }
            />
            <input
              className="index-input"
              inputMode="decimal"
              value={p.indexText}
              placeholder="Index"
              onChange={(e) => setPlayer(i, 'indexText', e.target.value)}
              aria-label={`Player ${i + 1} handicap index`}
            />
            {players.length > 1 && (
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
        {players.length < MAX_PLAYERS && (
          <button className="btn btn-ghost full" onClick={() => setPlayers((ps) => [...ps, newPlayer()])}>
            + Add player
          </button>
        )}
        <p className="hint">
          Start typing a name to add a friend: their handicap index fills in from their profile. Anyone else, just type their name
          and index. Plus handicap? Type +2.1.
        </p>
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
                  {!available && <span className="muted"> · {gameLimitText(type)}</span>}
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

      {showTeams && (
        <section className="card">
          <h2>Teams</h2>
          <p className="hint">Who plays together in your 2 vs 2 games.</p>
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
    skins: s.mode === 'pot' ? 'Buy-in per player' : 'Per skin, from each player',
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
          {type === 'skins' && s.mode === 'pot' ? (
            <input inputMode="decimal" value={s.buyIn} onChange={(e) => set('buyIn', e.target.value)} />
          ) : (
            <input inputMode="decimal" value={s.stake} onChange={(e) => set('stake', e.target.value)} />
          )}
        </div>
      </label>
      {type === 'skins' && (
        <div className="seg wide">
          <button className={s.mode !== 'pot' ? 'on' : ''} onClick={() => set('mode', 'perSkin')}>
            Pay per skin
          </button>
          <button className={s.mode === 'pot' ? 'on' : ''} onClick={() => set('mode', 'pot')}>
            Pot (buy-in)
          </button>
        </div>
      )}
      {type === 'skins' && s.mode === 'pot' && (
        <p className="hint">Everyone puts in the buy-in; the pot is split by skins won. Good for big groups.</p>
      )}
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
              <p className="hint">Pick the teams under Teams, below the games.</p>
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
