import { useEffect, useState } from 'react';
import { searchCourses, fetchCourse } from '../lib/courseSearch.js';
import { ATTRIBUTION } from '../lib/courseImport.js';

// Type a course name, tap a result, get the full card. onPick({ course, warnings }).
export default function CourseSearch({ onPick }) {
  const [query, setQuery] = useState('');
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
  return (
    <div className="course-search">
      <label className="field">
        <span>Find a course</span>
        <input
          type="search"
          value={query}
          placeholder="Search by name, e.g. Oak Hills"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search courses"
        />
      </label>
      {status === 'searching' && <p className="muted">Searching…</p>}
      {status === 'loading' && <p className="muted">Loading scorecard…</p>}
      {status === 'error' && <p className="search-error">{error}</p>}
      {searching && status === 'idle' && results.length === 0 && (
        <p className="muted">No courses found. Try another spelling, or enter it below.</p>
      )}
      {results.length > 0 && (
        <>
          <ul className="search-results">
            {results.map((c) => (
              <li key={c.id}>
                <button onClick={() => pick(c.id)} disabled={status === 'loading'}>
                  <strong>{c.name}</strong>
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
    </div>
  );
}
