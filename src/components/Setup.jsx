import { useEffect, useState } from 'react';
import {
  blankCourse,
  courseProblems,
  defaultSettings,
  formatIndex,
  makeId,
  newRound,
  parseIndex,
  teeLabel,
  MAX_PLAYERS,
} from '../lib/roundSetup.js';
import { listCourses, saveCourse } from '../lib/storage.js';
import CourseSearch from './CourseSearch.jsx';
import { NumberField, Toggle } from './controls.jsx';
import GamePicker from './GamePicker.jsx';

import PlayerSearch from './PlayerSearch.jsx';
import { listRecentGolfers, rememberGolfers } from '../lib/recentGolfers.js';

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
  // Row 1 is you. Everyone else must be a Scribble member picked from the list.
  const [players, setPlayers] = useState(() => [{ ...newPlayer(profile), userId: meId, me: true }, newPlayer()]);
  const [recentGolfers] = useState(() => (meId ? listRecentGolfers(meId) : []));
  const [settings, setSettings] = useState(defaultSettings);
  const [errors, setErrors] = useState([]);
  const [courseNotes, setCourseNotes] = useState([]);


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

  const setTee = (field, value) =>
    setCourse((c) => ({ ...c, tees: c.tees.map((t, i) => (i === teeIdx ? { ...t, [field]: value } : t)) }));
  const setHole = (i, field, value) =>
    setCourse((c) => ({ ...c, holes: c.holes.map((h, j) => (j === i ? { ...h, [field]: value } : h)) }));
  const setPlayer = (i, field, value) =>
    setPlayers((ps) => ps.map((p, j) => (j === i ? { ...p, [field]: value } : p)));
  // Share the app so friends can make an account and join the round.
  async function inviteToScribble() {
    const url = 'https://scribblegolfclub.com/app/';
    const text = 'Join me on Scribble Golf Club: we score our rounds and settle up our side games in the app.';
    try {
      if (navigator.share) await navigator.share({ title: 'Scribble Golf Club', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        alert('Invite link copied. Paste it in a text to your friend.');
      }
    } catch {
      // closed the share sheet
    }
  }

  // Grow or shrink the player list (new rows are blank; extra rows come off the bottom).
  function setCount(n) {
    setPlayers((ps) => {
      if (n > ps.length) return [...ps, ...Array.from({ length: n - ps.length }, () => newPlayer())];
      const cut = ps.slice(n).filter((p) => p.name.trim());
      if (cut.length && !confirm(`Remove ${cut.map((p) => p.name).join(', ')}?`)) return ps;
      return ps.slice(0, n);
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
    // Everyone plays with a Scribble account.
    const outsiders = players.filter((p) => !p.me && !p.userId);
    if (outsiders.length) {
      const typed = outsiders.filter((p) => p.name.trim()).map((p) => p.name.trim());
      problems.push(
        typed.length
          ? `${typed.join(', ')}: pick ${typed.length === 1 ? 'them' : 'each player'} from the list. Everyone in a round needs a Scribble account; not on Scribble yet? Send them an invite.`
          : `Pick a Scribble member for every player spot (or lower the number of players).`,
      );
    }
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
    if (meId) rememberGolfers(meId, players.filter((p) => p.userId && !p.me).map((p) => ({ id: p.userId, name: p.name, username: p.username, avatarUrl: p.avatarUrl, index: parseIndex(p.indexText) })));
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
                    <NumberField
                      className="hcp-input"
                      aria-label={`Hole ${i + 1} handicap`}
                      value={h.hcp}
                      min={1}
                      max={18}
                      onChange={(n) => setHole(i, 'hcp', n)}
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
        {players.map((p, i) => (
          <div className="player-row" key={p.id}>
            {p.me ? (
              <div className="grow me-row" aria-label="You">
                <strong>{p.name || 'You'}</strong> <span className="muted">(you)</span>
              </div>
            ) : (
            <PlayerSearch
              value={p.name}
              placeholder={`Player ${i + 1}`}
              ariaLabel={`Player ${i + 1} name`}
              meId={meId}
              recent={recentGolfers}
              exclude={players.flatMap((x) => [x.savedId && `saved:${x.savedId}`, x.userId && `user:${x.userId}`]).filter(Boolean)}
              onChange={(name) =>
                // Editing the name by hand unlinks the picked golfer.
                setPlayers((ps) => ps.map((x, j) => (j === i ? { ...x, name, savedId: null, userId: null } : x)))
              }
              onPick={(picked) =>
                setPlayers((ps) =>
                  ps.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          name: picked.name,
                          indexText: picked.index == null ? x.indexText : formatIndex(picked.index),
                          savedId: picked.savedId,
                          userId: picked.userId,
                          username: picked.username ?? '',
                          avatarUrl: picked.avatarUrl ?? null,
                        }
                      : x,
                  ),
                )
              }
            />
            )}
            <input
              className="index-input"
              inputMode="decimal"
              value={p.indexText}
              placeholder="Index"
              onChange={(e) => setPlayer(i, 'indexText', e.target.value)}
              aria-label={`Player ${i + 1} handicap index`}
            />
            {players.length > 1 && !p.me && (
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
        {players.some((p) => !p.me && p.name.trim() && !p.userId) && (
          <p className="search-error">
            {players
              .filter((p) => !p.me && p.name.trim() && !p.userId)
              .map((p) => p.name.trim())
              .join(', ')}
            : pick from the list. Only Scribble members can play.
          </p>
        )}
        <p className="hint">
          Everyone in the round needs a Scribble account. Start typing to find friends and members: their handicap index fills in
          from their profile. Plus handicap? Type +2.1.
        </p>
        <button className="btn btn-ghost outline full" onClick={inviteToScribble}>
          Invite someone to Scribble
        </button>
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

      <GamePicker settings={settings} setSettings={setSettings} players={named} holeCount={course.holes.length} />


      <button className="btn btn-primary btn-xl sticky-bottom" onClick={start}>
        Tee off
      </button>
    </div>
  );
}
