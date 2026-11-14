import { useEffect, useState } from 'react';
import CourseSearch from './CourseSearch.jsx';
import { listCourses } from '../lib/storage.js';

// Pick a home course from the same course database used for rounds and
// photo tags. value / onChange: { name, key, place } or null. A course that
// isn't in the database can still be typed in (no key).
export default function HomeCoursePicker({ value, onChange, disabled }) {
  const [saved, setSaved] = useState([]);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    listCourses()
      .then(setSaved)
      .catch(() => {});
  }, []);

  if (value?.name) {
    return (
      <div className="tagged home-course">
        <div>
          <strong>⛳ {value.name}</strong>
          {value.place && <span className="muted">{value.place}</span>}
        </div>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange(null)} disabled={disabled}>
          Change
        </button>
      </div>
    );
  }

  if (typing) {
    return (
      <div className="home-course-type">
        <input value={text} placeholder="Course name" onChange={(e) => setText(e.target.value)} autoFocus />
        <div className="row2">
          <button type="button" className="btn btn-ghost" onClick={() => setTyping(false)}>
            Back to search
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!text.trim()}
            onClick={() => onChange({ name: text.trim(), key: null, place: '' })}
          >
            Use this name
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="home-course-pick">
      <CourseSearch onPick={({ course }) => onChange({ name: course.name, key: course.id, place: course.place ?? '' })} />
      {saved.length > 0 && (
        <div className="chips">
          {saved.slice(0, 6).map((c) => (
            <button
              type="button"
              key={c.id}
              className="chip"
              onClick={() => onChange({ name: c.name, key: c.id, place: c.place ?? '' })}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="link small-link" onClick={() => setTyping(true)}>
        Can&apos;t find it? Type the name
      </button>
    </div>
  );
}
