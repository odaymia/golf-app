import { useEffect, useState } from 'react';
import { listCourses } from '../lib/storage.js';
import { blankCourse, teeLabel } from '../lib/roundSetup.js';
import CourseSearch from './CourseSearch.jsx';

// Pick a course and tees, the same way as New round: blank to start, recent
// courses when you tap the empty search, close-match results as you type,
// "+ Use … as a new course" for courses not in the database, and a tees
// dropdown. Used where commissioners add league/tournament rounds.
// onChange({ course, teeIdx, notes })
export default function CoursePicker({ course, teeIdx, notes = [], onChange }) {
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    listCourses()
      .then(setRecent)
      .catch(() => {});
  }, []);

  const tee = course ? course.tees[teeIdx] ?? course.tees[0] : null;
  const fromDb = course && String(course.id).startsWith('oga-');
  const setTee = (field, value) =>
    onChange({ course: { ...course, tees: course.tees.map((t, i) => (i === teeIdx ? { ...t, [field]: value } : t)) }, teeIdx, notes });

  return (
    <div className="course-picker">
      <CourseSearch
        onPick={({ course: c, warnings }) => {
          const saved = recent.find((x) => x.id === c.id);
          onChange({ course: saved ?? c, teeIdx: 0, notes: saved ? [] : warnings });
        }}
        recent={recent}
        onPickRecent={(c) => onChange({ course: c, teeIdx: 0, notes: [] })}
        onCustom={(name) => onChange({ course: { ...blankCourse(), name }, teeIdx: 0, notes: [] })}
      />
      {course && (
        <>
          <p className="course-picked">
            <span>
              <strong>{course.name}</strong>
              {course.place && <span className="muted"> · {course.place}</span>}
            </span>
            <button className="link small-link" onClick={() => onChange({ course: null, teeIdx: 0, notes: [] })}>
              Clear
            </button>
          </p>
          {notes.length > 0 && (
            <div className="warn-box course-notes">
              {notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}
          <label className="field">
            <span>Tees</span>
            <select value={teeIdx} onChange={(e) => onChange({ course, teeIdx: Number(e.target.value), notes })} aria-label="Tees">
              {course.tees.map((t, i) => (
                <option key={i} value={i}>
                  {teeLabel(t, i)}
                </option>
              ))}
            </select>
          </label>
          {fromDb ? (
            tee.yards ? <p className="tee-summary"><span>{Number(tee.yards).toLocaleString()} yds · par {course.holes.reduce((s, h) => s + h.par, 0)}</span></p> : null
          ) : (
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
          )}
        </>
      )}
    </div>
  );
}
