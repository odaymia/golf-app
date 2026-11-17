import { useState } from 'react';
import { createEvent } from '../../lib/leagueApi.js';
import { orderEvents } from '../../lib/league/season.js';
import { seasonDates } from '../../lib/league/pro.js';
import { normalizeTeeSheet, teeGroups, formatTime } from '../../lib/league/pairings.js';
import { MATCH_FORMATS, matchFormat } from '../../lib/league/event.js';
import { courseProblems } from '../../lib/roundSetup.js';
import { saveCourse } from '../../lib/storage.js';
import CoursePicker from '../CoursePicker.jsx';
import { Seg } from '../controls.jsx';

const fmtDate = (d) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '–';

function teeSummary(e) {
  if (!e.teeSheet || !teeGroups(e).length) return <span className="muted">–</span>;
  const t = normalizeTeeSheet(e.teeSheet);
  return t.mode === 'shotgun' ? `Shotgun ${formatTime(t.start)}` : `${formatTime(t.start)} · every ${t.interval} min`;
}

// The season at a glance, and building many rounds at once.
export default function ProSchedule({ data, computed, isAdmin, reload, openEvent }) {
  const events = orderEvents(data.events);
  const [building, setBuilding] = useState(events.length === 0 && isAdmin);
  const { settings } = computed;
  const tournament = settings.kind === 'tournament';

  return (
    <div className="pro-page">
      <div className="pro-page-head">
        <h2 className="pro-h">Schedule</h2>
        <span className="muted">
          {events.length} round{events.length === 1 ? '' : 's'}
        </span>
        {isAdmin && !building && (
          <div className="pro-actions">
            <button className="btn btn-primary" onClick={() => setBuilding(true)}>
              + Add rounds
            </button>
          </div>
        )}
      </div>

      {building && (
        <ScheduleBuilder
          leagueId={data.league.id}
          count={events.length}
          label={tournament ? 'Round' : 'Week'}
          usesTiers={settings.season === 'points'}
          defaultRounds={tournament ? Math.max(1, settings.rounds - events.length) : 12}
          onDone={async (made) => {
            setBuilding(false);
            if (made) await reload();
          }}
        />
      )}

      {events.length > 0 && (
        <div className="pro-table-wrap">
          <table className="pro-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Round</th>
                <th>Date</th>
                <th>Course</th>
                {settings.season === 'points' && <th>Type</th>}
                {settings.scoring === 'match' ? <th>Matches</th> : <th>Groups</th>}
                <th>Tee times</th>
                <th>Cards in</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => {
                const cards = Object.keys(data.scores[e.id] ?? {}).length;
                const formats = [...new Set(e.matchups.map((m) => MATCH_FORMATS[matchFormat(m)].short))].join(' + ');
                return (
                  <tr key={e.id} className="clickable" onClick={() => openEvent(e.id)}>
                    <td className="muted">{i + 1}</td>
                    <td className="strong">{e.name}</td>
                    <td>{fmtDate(e.date)}</td>
                    <td>
                      {e.course.name}
                      <span className="muted small"> · {e.course.tee?.name}</span>
                    </td>
                    {settings.season === 'points' && <td>{e.tier === 'major' ? <span className="major-tag">Major</span> : 'Regular'}</td>}
                    {settings.scoring === 'match' ? (
                      <td>{e.matchups.length ? `${e.matchups.length}${formats ? ` · ${formats}` : ''}` : <span className="pill wait">Not set</span>}</td>
                    ) : (
                      <td>{(e.groups ?? []).length ? `${e.groups.length} groups` : <span className="pill wait">Not set</span>}</td>
                    )}
                    <td>{teeSummary(e)}</td>
                    <td>{cards}</td>
                    <td>
                      <span className={`pill ${e.status === 'final' ? '' : 'ok'}`}>{e.status === 'final' ? 'Final' : 'Open'}</span>
                    </td>
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-small">Manage ›</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScheduleBuilder({ leagueId, count, label, usesTiers, defaultRounds, onDone }) {
  const [start, setStart] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [rounds, setRounds] = useState(defaultRounds);
  const [every, setEvery] = useState(7);
  const [prefix, setPrefix] = useState(label);
  const [tier, setTier] = useState('regular');
  const [pick, setPick] = useState({ course: null, teeIdx: 0, notes: [] });
  const { course, teeIdx } = pick;
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const dates = seasonDates(start, Math.min(52, Math.max(1, Number(rounds) || 1)), Number(every) || 7);

  async function create() {
    if (!course) return setError('Pick a course: search for it, or type its name and add it as a new course.');
    const raw = course.tees[teeIdx] ?? course.tees[0];
    const tee = { ...raw, rating: Number(raw.rating), slope: Number(raw.slope) };
    const problems = courseProblems(course, tee);
    if (problems.length) return setError(problems[0]);
    setError('');
    setProgress(0);
    try {
      await saveCourse({ ...course, tees: course.tees.map((t) => ({ ...t, rating: Number(t.rating), slope: Number(t.slope) })) }).catch(() => {});
      for (let i = 0; i < dates.length; i++) {
        await createEvent(leagueId, {
          name: `${prefix.trim() || label} ${count + i + 1}`,
          date: dates[i],
          tier: usesTiers ? tier : 'regular',
          course: { name: course.name, holes: course.holes, tee: { name: tee.name, rating: tee.rating, slope: tee.slope } },
        });
        setProgress(i + 1);
      }
      onDone(true);
    } catch (e) {
      setError(e.message);
      setProgress(null);
    }
  }

  return (
    <section className="pro-card">
      <h3>Add rounds</h3>
      <div className="pro-form-grid">
        <label className="field">
          <span>First round</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>How many rounds</span>
          <input inputMode="numeric" value={rounds} onChange={(e) => setRounds(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field">
          <span>Repeat</span>
          <select value={every} onChange={(e) => setEvery(Number(e.target.value))}>
            <option value={1}>Every day</option>
            <option value={7}>Every week</option>
            <option value={14}>Every two weeks</option>
            <option value={28}>Every four weeks</option>
          </select>
        </label>
        <label className="field">
          <span>Name</span>
          <input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </label>
      </div>
      {usesTiers && (
        <Seg
          value={tier}
          options={[
            ['regular', 'Regular rounds'],
            ['major', 'Majors'],
          ]}
          onChange={setTier}
        />
      )}
      <div className="pro-course-pick">
        <CoursePicker
          course={course}
          teeIdx={teeIdx}
          notes={pick.notes}
          onChange={(next) => {
            setPick(next);
            setError('');
          }}
        />
      </div>
      <p className="hint">
        Creates {dates.length} round{dates.length === 1 ? '' : 's'}: {dates.slice(0, 4).map(fmtDate).join(', ')}
        {dates.length > 4 ? ` … ${fmtDate(dates.at(-1))}` : ''}. You can rename or re-date any round later under Manage.
      </p>
      {error && <div className="pro-alert error">{error}</div>}
      <div className="pro-actions">
        <button className="btn btn-ghost" onClick={() => onDone(false)} disabled={progress != null}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={create} disabled={progress != null}>
          {progress != null ? `Creating ${progress} of ${dates.length}…` : `Create ${dates.length} round${dates.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </section>
  );
}
