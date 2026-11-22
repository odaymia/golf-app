import { useEffect, useState } from 'react';
import { searchCourses, fetchCourse, matchSaved } from '../lib/courseSearch.js';
import { ATTRIBUTION } from '../lib/courseImport.js';
import { BUILTIN_COURSES } from '../lib/builtinCourses.js';
import { RatingBadge, useCourseRatings } from './CourseRatings.jsx';

// Type a course name, tap a result, get the full card. onPick({ course, warnings }).
// recent (optional): courses saved on this phone, shown when the box is
// tapped while empty; onPickRecent(course) when one is chosen.
// onCustom(name) (optional): use what was typed as a new course not in the database.
export default function CourseSearch({ onPick, recent = [], onPickRecent, onCustom }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | searching | loading | error
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setStatus('searching');
      searchCourses(query, { signal: ctrl.signal })
        .then((r) => {
          setResults(r);
          setStatus('idle');
        })
        .catch((e) => {
          if (e.name === 'AbortError') return;
          setError(e.message);
          setStatus('error');
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  async function pick(id) {
    setStatus('loading');
    try {
      onPick(await fetchCourse(id));
      setQuery('');
      setResults([]);
      setStatus('idle');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }

  const searching = query.trim().length >= 3;
  // Courses already on this phone that match: instant, and still there when
  // the course database is down.
  const saved = onPickRecent ? matchSaved(query, recent).slice(0, 5) : [];
  const savedIds = new Set(saved.map((c) => c.id));
  // Courses built into Scribble (real tees and ratings, always available).
  const builtin = matchSaved(query, BUILTIN_COURSES).filter((c) => !savedIds.has(c.id));
  const ratings = useCourseRatings([...builtin.map((c) => c.id), ...results.map((c) => `oga-${c.id}`)]);
  const pickBuiltin = (c) => {
    setQuery('');
    setResults([]);
    setStatus('idle');
    onPick({ course: structuredClone(c), warnings: [] });
  };
  return (
    <div className="course-search">
      <label className="field">
        <span>Find a course</span>
        <input
          type="search"
          value={query}
          placeholder="Search by name, e.g. Oak Hills"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          aria-label="Search courses"
        />
      </label>
      {focused && !query.trim() && recent.length > 0 && onPickRecent && (
        <div className="recent-courses" onMouseDown={(e) => e.preventDefault()}>
          <p className="ps-h">Recent courses</p>
          <ul className="search-results">
            {recent.slice(0, 6).map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setFocused(false);
                    onPickRecent(c);
                  }}
                >
                  <strong>{c.name}</strong>
                  <span className="muted">{[c.place, c.tees?.map((t) => t.name).filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {saved.length > 0 && (
        <div className="recent-courses">
          <p className="ps-h">Saved on this phone</p>
          <ul className="search-results">
            {saved.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setQuery('');
                    setResults([]);
                    onPickRecent(c);
                  }}
                >
                  <strong>{c.name}</strong>
                  <span className="muted">{[c.place, c.tees?.map((t) => t.name).filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {builtin.length > 0 && (
        <div className="recent-courses">
          <p className="ps-h">Courses in Scribble</p>
          <ul className="search-results">
            {builtin.map((c) => (
              <li key={c.id}>
                <button onClick={() => pickBuiltin(c)}>
                  <strong>
                    {c.name} <RatingBadge summary={ratings[c.id]} />
                  </strong>
                  <span className="muted">
                    {c.place} · par {c.holes.reduce((t, h) => t + h.par, 0)} · {c.tees.filter((t) => !t.name.endsWith('(W)')).map((t) => t.name).join(' / ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {status === 'searching' && <p className="muted">Searching…</p>}
      {status === 'loading' && <p className="muted">Loading scorecard…</p>}
      {status === 'error' && <p className="search-error">{error}</p>}
      {searching && status === 'idle' && results.length === 0 && saved.length === 0 && builtin.length === 0 && (
        <p className="muted">No courses found. Try another spelling{onCustom ? ', or add it as a new course' : ''}.</p>
      )}
      {results.length > 0 && (
        <>
          <ul className="search-results">
            {results.filter((c) => !savedIds.has(`oga-${c.id}`)).map((c, i, list) => (
              <li key={c.id}>
                {c.similar && !list[i - 1]?.similar && (
                  <p className="ps-h similar-h">{i === 0 ? `No exact match for “${query.trim()}”. Similar names:` : 'Similar names'}</p>
                )}
                <button onClick={() => pick(c.id)} disabled={status === 'loading'}>
                  <strong>
                    {c.name} <RatingBadge summary={ratings[`oga-${c.id}`]} />
                  </strong>
                  <span className="muted">
                    {c.place}
                    {c.holes ? ` · ${c.holes} holes` : ''}
                    {c.par ? ` · par ${c.par}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="attribution">Course data {ATTRIBUTION}</p>
        </>
      )}
      {onCustom && searching && status !== 'searching' && status !== 'loading' && (
        <button
          className="btn btn-ghost outline full custom-course"
          onClick={() => {
            onCustom(query.trim());
            setQuery('');
            setResults([]);
          }}
        >
          + Use “{query.trim()}” as a new course
        </button>
      )}
    </div>
  );
}
