import { useState } from 'react';
import { createEvent, setTeam, updateEvent } from '../lib/leagueApi.js';
import { orderEvents } from '../lib/league/season.js';
import { MATCH_FORMATS, matchFormat } from '../lib/league/event.js';
import { defaultSplit, foursomesForMatches, isSplit, matchProblem, parseSplit, roundFormatText, sideSize, splitMatchups, splitProblem, splitText } from '../lib/league/ryder.js';
import { courseProblems } from '../lib/roundSetup.js';
import { saveCourse } from '../lib/storage.js';
import AddMembers from './AddMembers.jsx';
import CoursePicker from './CoursePicker.jsx';
import SplitEditor from './SplitEditor.jsx';
import { NumberField } from './controls.jsx';

const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date');
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Commissioner's Ryder Cup setup, in order: 1 Teams, 2 Rounds, 3 Matches.
export default function RyderSetup({ data, computed, me, reload, onOpenEvent }) {
  const sides = computed.settings.sides;
  const events = orderEvents(data.events);
  const players = data.members.filter((m) => m.active !== false);
  const onTeams = sides.map((s) => players.filter((m) => m.team === s));
  const teamsDone = onTeams.every((t) => t.length > 0);
  const roundsDone = events.length > 0;
  const [step, setStep] = useState(!teamsDone ? 'teams' : !roundsDone ? 'rounds' : 'matches');

  const steps = [
    ['teams', '1 Teams', teamsDone],
    ['rounds', '2 Rounds', roundsDone],
    ['matches', '3 Matches', roundsDone && events.every((e) => e.matchups.length > 0)],
  ];

  return (
    <div className="ryder-setup">
      <div className="tabs wide-tabs ryder-steps" role="tablist">
        {steps.map(([k, label, done]) => (
          <button key={k} role="tab" aria-selected={step === k} className={step === k ? 'on' : ''} onClick={() => setStep(k)}>
            {done ? '✓ ' : ''}
            {label}
          </button>
        ))}
      </div>
      {step === 'teams' && <TeamsStep data={data} sides={sides} onTeams={onTeams} players={players} me={me} reload={reload} next={() => setStep('rounds')} />}
      {step === 'rounds' && <RoundsStep data={data} computed={computed} events={events} reload={reload} next={() => setStep('matches')} />}
      {step === 'matches' && <MatchesStep data={data} sides={sides} events={events} reload={reload} onOpenEvent={onOpenEvent} />}
    </div>
  );
}

function TeamsStep({ data, sides, onTeams, players, me, reload, next }) {
  const [adding, setAdding] = useState(null); // side name
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loose = players.filter((m) => !sides.includes(m.team));

  async function move(ids, team) {
    setBusy(true);
    setError('');
    try {
      await setTeam(ids, team);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="hint">Pick who plays for each team. Only Scribble members can play.</p>
      <div className="ryder-teams">
        {sides.map((side, i) => (
          <section key={side} className={`card ryder-team side-${i}`}>
            <div className="pro-card-head">
              <h3>
                {side} <span className="muted">({onTeams[i].length})</span>
              </h3>
            </div>
            {onTeams[i].length === 0 && <p className="muted small">No players yet.</p>}
            <ul className="lines">
              {onTeams[i].map((m) => (
                <li key={m.id} className="match-line">
                  <span>{m.name}</span>
                  <span>
                    <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => move([m.id], sides[1 - i])} aria-label={`Move ${m.name} to ${sides[1 - i]}`}>
                      ⇄
                    </button>
                    <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => move([m.id], '')} aria-label={`Take ${m.name} off ${side}`}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {adding === side ? (
              <AddMembers
                league={data.league}
                members={data.members}
                meId={me?.userId}
                team={side}
                title={`Add to ${side}`}
                onClose={() => setAdding(null)}
                onAdded={() => reload()}
              />
            ) : (
              <button className="btn btn-ghost outline full" onClick={() => setAdding(side)}>
                + Add players to {side}
              </button>
            )}
          </section>
        ))}
      </div>
      {loose.length > 0 && (
        <section className="card">
          <h3>Not on a team yet</h3>
          <ul className="lines">
            {loose.map((m) => (
              <li key={m.id} className="match-line">
                <span>{m.name}</span>
                <span className="team-buttons">
                  {sides.map((s) => (
                    <button key={s} className="btn btn-ghost btn-small outline" disabled={busy} onClick={() => move([m.id], s)}>
                      {s}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <div className="card error-box">{error}</div>}
      <button className="btn btn-primary btn-xl" disabled={!onTeams.every((t) => t.length)} onClick={next}>
        Next: rounds
      </button>
    </>
  );
}

// A round's course as saved on the round (name, holes, chosen tee).
const snapshot = (course, teeIdx) => {
  const raw = course.tees[teeIdx] ?? course.tees[0];
  return { key: course.id, name: course.name, holes: course.holes, tee: { name: raw.name, rating: Number(raw.rating), slope: Number(raw.slope) } };
};

function RoundsStep({ data, computed, events, reload, next }) {
  const today = new Date().toLocaleDateString('en-CA');
  const [count, setCount] = useState(Math.max(events.length, computed.settings.rounds ?? 1, 1));
  // Each round: its day, format and course. Existing rounds keep their course
  // unless you change it (only before any scores are in).
  const [rows, setRows] = useState(() =>
    Array.from({ length: 10 }, (_, i) => {
      const e = events[i];
      const lastFormat = i === Math.max(2, count) - 1 ? 'singles' : 'fourball';
      return e
        ? {
            id: e.id,
            date: e.date ?? today,
            format: isSplit(e.matchFormat) ? 'split' : (e.matchFormat ?? (e.matchups[0] ? matchFormat(e.matchups[0]) : 'fourball')),
            split: isSplit(e.matchFormat) ? parseSplit(e.matchFormat, e.course?.holes?.length ?? 18) : null,
            matches: e.matchups.length,
            scored: Object.keys(data.scores[e.id] ?? {}).length > 0,
            saved: e.course,
            pick: null,
            changing: false,
          }
        : {
            id: null,
            date: addDays(events.at(-1)?.date ?? today, events.length ? i - events.length + 1 : i),
            format: lastFormat,
            split: null,
            matches: 0,
            scored: false,
            saved: null,
            pick: null,
            changing: true,
          };
    }),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // Holes in a round's course (18 until a course is picked).
  const holeCount = (r) => r.pick?.course?.holes?.length ?? r.saved?.holes?.length ?? 18;

  // Picking a course for a round also fills the same course into later new
  // rounds that don't have one yet (most events stay at one course).
  function pickCourse(i, pick) {
    setRows((rs) =>
      rs.map((r, j) => {
        if (j === i) return { ...r, pick };
        if (j > i && j < count && !r.id && !r.pick && pick.course) return { ...r, pick };
        return r;
      }),
    );
    setError('');
  }

  async function save() {
    setError('');
    const list = rows.slice(0, count);
    for (const [i, r] of list.entries()) {
      if (!r.id && !r.pick?.course) return setError(`Pick a course for Round ${i + 1}.`);
      if (r.pick?.course) {
        const problems = courseProblems(r.pick.course, snapshot(r.pick.course, r.pick.teeIdx).tee);
        if (problems.length) return setError(`Round ${i + 1}: ${problems[0]}`);
      }
      const e = events.find((x) => x.id === r.id);
      const holesIn = holeCount(r);
      if (r.format === 'split') {
        const problem = splitProblem(r.split ?? defaultSplit(holesIn), holesIn);
        if (problem) return setError(`Round ${i + 1}: ${problem}`);
      }
      const was = e?.matchFormat ?? null;
      const now = r.format === 'split' ? splitText(r.split ?? defaultSplit(holesIn)) : r.format;
      if (e?.matchups.length && (isSplit(was) || r.format === 'split') && was !== now)
        return setError(`Round ${i + 1} already has matches. Remove them under Matches to change its split.`);
      if (e?.matchups.length && !isSplit(was) && r.format !== 'split' && sideSize(matchFormat(e.matchups[0])) !== sideSize(r.format))
        return setError(`Round ${i + 1} already has ${sideSize(matchFormat(e.matchups[0])) === 1 ? 'singles' : '2 vs 2'} matches. Remove them under Matches to change it.`);
    }
    setBusy(true);
    try {
      for (const [i, r] of list.entries()) {
        if (r.pick?.course) {
          const c = r.pick.course;
          await saveCourse({ ...c, tees: c.tees.map((t) => ({ ...t, rating: Number(t.rating), slope: Number(t.slope) })) }).catch(() => {});
        }
        const e = events.find((x) => x.id === r.id);
        const format = r.format === 'split' ? splitText(r.split ?? defaultSplit(holeCount(r))) : r.format;
        if (e) {
          const patch = {};
          if ((e.date ?? '') !== r.date) patch.date = r.date;
          if ((e.matchFormat ?? '') !== format) patch.matchFormat = format;
          if (r.format !== 'split' && e.matchups.length && matchFormat(e.matchups[0]) !== r.format) patch.matchups = e.matchups.map((mu) => ({ ...mu, format: r.format }));
          if (r.pick?.course && !r.scored) patch.course = snapshot(r.pick.course, r.pick.teeIdx);
          if (Object.keys(patch).length) await updateEvent(e.id, patch);
        } else {
          const ev = await createEvent(data.league.id, { name: `Round ${i + 1}`, date: r.date, course: snapshot(r.pick.course, r.pick.teeIdx) });
          await updateEvent(ev.id, { matchFormat: format });
        }
      }
      await reload();
      next();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <div className="count-row">
          <div>
            <strong>How many rounds?</strong>
            <span className="muted">Each round has its own day, format and course</span>
          </div>
          <div className="stepper">
            <button type="button" className="step" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Fewer rounds">
              −
            </button>
            <NumberField className="count-input" aria-label="Number of rounds" value={count} min={1} max={10} onChange={setCount} />
            <button type="button" className="step" onClick={() => setCount((c) => Math.min(10, c + 1))} aria-label="More rounds">
              +
            </button>
          </div>
        </div>
        {count < events.length && <p className="hint">There are {events.length} rounds already. Delete extra rounds from the round’s Manage page.</p>}
      </section>
      {rows.slice(0, count).map((r, i) => (
        <section key={i} className="card ryder-round">
          <h3>
            Round {i + 1}
            {r.id && r.matches > 0 && <span className="muted small"> · {r.matches} matches set</span>}
          </h3>
          <div className="row2">
            <label className="field">
              <span>Day</span>
              <input type="date" value={r.date} onChange={(e) => setRow(i, { date: e.target.value })} />
            </label>
            <label className="field">
              <span>Format</span>
              <select
                value={r.format}
                onChange={(e) => setRow(i, { format: e.target.value, split: e.target.value === 'split' ? (r.split ?? defaultSplit(holeCount(r))) : r.split })}
              >
                {Object.entries(MATCH_FORMATS).map(([k, f]) => (
                  <option key={k} value={k}>
                    {f.size === 1 ? 'Singles · 1 vs 1' : `${f.short} · 2 vs 2`}
                  </option>
                ))}
                <option value="split">Split round · formats change by holes</option>
              </select>
            </label>
          </div>
          {r.format === 'split' && <SplitEditor segs={r.split ?? defaultSplit(holeCount(r))} n={holeCount(r)} onChange={(split) => setRow(i, { split })} />}
          <p className="muted small">{fmtDate(r.date)}</p>
          <div className="field">
            <span>Course</span>
          </div>
          {r.saved && !r.changing ? (
            <p className="course-picked">
              <span>
                <strong>{r.saved.name}</strong>
                <span className="muted"> · {r.saved.tee?.name} {r.saved.tee?.rating}/{r.saved.tee?.slope}</span>
              </span>
              {r.scored ? (
                <span className="muted small">scores in</span>
              ) : (
                <button className="link small-link" onClick={() => setRow(i, { changing: true })}>
                  Change
                </button>
              )}
            </p>
          ) : (
            <>
              <CoursePicker
                course={r.pick?.course ?? null}
                teeIdx={r.pick?.teeIdx ?? 0}
                notes={r.pick?.notes ?? []}
                onChange={(pick) => pickCourse(i, pick)}
              />
              {r.saved && (
                <button className="link small-link" onClick={() => setRow(i, { changing: false, pick: null })}>
                  Keep {r.saved.name}
                </button>
              )}
            </>
          )}
        </section>
      ))}
      {error && <div className="card error-box">{error}</div>}
      <button className="btn btn-primary btn-xl" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save rounds · Next: matches'}
      </button>
    </>
  );
}

function MatchesStep({ data, sides, events, reload, onOpenEvent }) {
  const [eventId, setEventId] = useState(events.find((e) => !e.matchups.length)?.id ?? events[0]?.id);
  const event = events.find((e) => e.id === eventId);
  const [a, setA] = useState([]);
  const [b, setB] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!event) return <p className="muted center">Add rounds first.</p>;

  const format = event.matchFormat ?? (event.matchups[0] ? matchFormat(event.matchups[0]) : 'fourball');
  const split = isSplit(format) ? parseSplit(format, event.course?.holes?.length ?? 18) : null;
  const n = split ? 2 : sideSize(format);
  const name = (id) => data.members.find((m) => m.id === id)?.name ?? '?';
  const teamOf = (id) => data.members.find((m) => m.id === id)?.team;
  const used = new Set(event.matchups.flatMap((mu) => mu.sides.flat()));
  const team = (side) => data.members.filter((m) => m.active !== false && m.team === side && !used.has(m.id));
  const groups = foursomesForMatches(event.matchups);
  const foursomeOf = (mu) => groups.findIndex((g) => mu.sides.flat().every((id) => g.includes(id))) + 1;

  async function saveMatches(matchups) {
    setBusy(true);
    setError('');
    try {
      await updateEvent(event.id, { matchups, groups: foursomesForMatches(matchups), matchFormat: format });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addMatch() {
    const problem = matchProblem({ a, b, format: split ? 'fourball' : format, sides, teamOf, used });
    if (problem) return setError(problem);
    if (split) {
      const set = Math.max(0, ...event.matchups.map((mu) => mu.set ?? 0)) + 1;
      await saveMatches([...event.matchups, ...splitMatchups(a, b, split, set)]);
    } else await saveMatches([...event.matchups, { sides: [a, b], format }]);
    setA([]);
    setB([]);
  }

  const moveMatch = (i, d) => {
    const list = [...event.matchups];
    const [m] = list.splice(i, 1);
    list.splice(i + d, 0, m);
    saveMatches(list);
  };

  const pickList = (side, sel, setSel) => (
    <div className="ryder-pick">
      <p className="ps-h">{side}</p>
      <div className="chips">
        {team(side).map((m) => (
          <button
            key={m.id}
            className={`chip ${sel.includes(m.id) ? 'on' : ''}`}
            onClick={() => setSel((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : s.length < n ? [...s, m.id] : n === 1 ? [m.id] : s))}
          >
            {m.name}
          </button>
        ))}
        {team(side).length === 0 && <span className="muted small">Everyone has a match.</span>}
      </div>
    </div>
  );

  return (
    <>
      <div className="chips round-chips">
        {events.map((e, i) => (
          <button key={e.id} className={`chip ${e.id === eventId ? 'on' : ''}`} onClick={() => (setEventId(e.id), setA([]), setB([]), setError(''))}>
            Round {i + 1}
            {e.matchups.length ? ` · ${e.matchups.length}` : ''}
          </button>
        ))}
      </div>
      <section className="card">
        <h3>
          {event.name} · {split ? 'Split round' : MATCH_FORMATS[format].short}
        </h3>
        {split && <p className="split-plan">{roundFormatText(format, event.course?.holes?.length ?? 18)}</p>}
        <p className="hint">
          {split
            ? 'Pick 2 players from each team. They play the whole round as one foursome; each stretch of holes is its own match and point (singles: first vs first, second vs second).'
            : n === 2
            ? `Pick 2 players from each team for each match. Each match plays as its own foursome.`
            : `Set the singles matches one at a time. Matches 1 and 2 play together as a foursome, then 3 and 4, and so on.`}
        </p>
        {pickList(sides[0], a, setA)}
        <p className="vs-label">vs</p>
        {pickList(sides[1], b, setB)}
        <button className="btn btn-primary full" disabled={busy || a.length !== n || b.length !== n} onClick={addMatch}>
          {split ? `Add foursome ${new Set(event.matchups.map((mu) => mu.set)).size + 1}` : `Add match ${event.matchups.length + 1}`}
        </button>
        {error && <p className="search-error">{error}</p>}
      </section>
      <section className="card">
        <h3>Matches</h3>
        {event.matchups.length === 0 && <p className="muted">No matches yet.</p>}
        {split ? (
          <SplitMatchList matchups={event.matchups} name={name} busy={busy} onSave={saveMatches} />
        ) : (
        <ol className="ryder-matches">
          {event.matchups.map((mu, i) => (
            <li key={i}>
              <span className="ryder-match-names">
                <strong>{mu.sides[0].map(name).join(' & ')}</strong> <em>vs</em> <strong>{mu.sides[1].map(name).join(' & ')}</strong>
                <span className="muted small"> · Foursome {foursomeOf(mu)}</span>
              </span>
              <span className="ryder-match-actions">
                <button className="btn btn-ghost btn-small" disabled={busy || i === 0} onClick={() => moveMatch(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button className="btn btn-ghost btn-small" disabled={busy || i === event.matchups.length - 1} onClick={() => moveMatch(i, 1)} aria-label="Move down">
                  ↓
                </button>
                <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => saveMatches(event.matchups.filter((_, j) => j !== i))} aria-label="Remove match">
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
        )}
        {event.matchups.length > 0 && (
          <button className="btn btn-ghost outline full" onClick={() => onOpenEvent(event.id)}>
            Tee times, side games and more ›
          </button>
        )}
      </section>
    </>
  );
}


// A split round's foursomes: each pair vs pair with its stretches; swap who
// plays whom in singles, or remove the foursome.
function SplitMatchList({ matchups, name, busy, onSave }) {
  const sets = [...new Set(matchups.map((mu) => mu.set))];
  const swap = (set) => {
    const singles = matchups.filter((mu) => mu.set === set && mu.format === 'singles');
    const byHoles = new Map();
    for (const mu of singles) {
      const k = mu.holes.join('-');
      if (!byHoles.has(k)) byHoles.set(k, []);
      byHoles.get(k).push(mu);
    }
    const swapped = new Map();
    for (const pair of byHoles.values()) {
      if (pair.length !== 2) continue;
      swapped.set(pair[0], { ...pair[0], sides: [pair[0].sides[0], pair[1].sides[1]] });
      swapped.set(pair[1], { ...pair[1], sides: [pair[1].sides[0], pair[0].sides[1]] });
    }
    onSave(matchups.map((mu) => swapped.get(mu) ?? mu));
  };
  return (
    <ol className="ryder-matches split-list">
      {sets.map((set, k) => {
        const mine = matchups.filter((mu) => mu.set === set);
        const team = mine.find((mu) => mu.sides[0].length === 2) ?? mine[0];
        const hasSingles = mine.some((mu) => mu.format === 'singles');
        return (
          <li key={set}>
            <span className="ryder-match-names">
              <strong>{team.sides[0].map(name).join(' & ')}</strong> <em>vs</em> <strong>{team.sides[1].map(name).join(' & ')}</strong>
              <span className="muted small"> · Foursome {k + 1}</span>
              <span className="split-sub">
                {mine.map((mu, j) => (
                  <span key={j}>
                    Holes {mu.holes[0]}–{mu.holes[1]} {MATCH_FORMATS[mu.format].short}
                    {mu.format === 'singles' ? `: ${name(mu.sides[0][0])} vs ${name(mu.sides[1][0])}` : ''}
                  </span>
                ))}
              </span>
            </span>
            <span className="ryder-match-actions">
              {hasSingles && (
                <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => swap(set)} aria-label="Swap singles pairings">
                  ⇄
                </button>
              )}
              <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => onSave(matchups.filter((mu) => mu.set !== set))} aria-label="Remove foursome">
                ✕
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
