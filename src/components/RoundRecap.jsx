import { useEffect, useRef, useState } from 'react';
import { requestRecap, rateCourse, myCourseRating } from '../lib/courseRatings.js';
import { RATING_CATEGORIES, rateableKey } from '../lib/roundRecap.js';

// The AI round recap card. Writes itself once when shown (if there's no saved
// recap), then keeps the text via onRecap so it isn't written twice. One
// recap per round: no rewrites (each one costs), only Try again after an error.
export function RoundRecap({ facts, recap, onRecap }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const asked = useRef(false);

  const write = async () => {
    setBusy(true);
    setError('');
    try {
      onRecap(await requestRecap(facts));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (recap || asked.current) return;
    asked.current = true;
    write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ text: recap });
      else {
        await navigator.clipboard.writeText(recap);
        setCopied(true);
      }
    } catch {
      // cancelled
    }
  };

  return (
    <section className="card recap-card">
      <h3>🎙️ Round recap</h3>
      {busy && <p className="recap-busy">Writing up your round…</p>}
      {!busy && recap && <p className="recap-text">{recap}</p>}
      {!busy && error && <p className="search-error">{error}</p>}
      <div className="recap-actions">
        {recap && !busy && (
          <button className="btn btn-ghost outline" onClick={share}>
            {copied ? 'Copied!' : 'Share recap'}
          </button>
        )}
        {!busy && !recap && error && (
          <button className="btn btn-ghost" onClick={write}>
            Try again
          </button>
        )}
      </div>
    </section>
  );
}

export function Stars({ value, onChange, label, size = 'big' }) {
  return (
    <span className={`stars stars-${size}`} role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? label : `${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, (value ?? 0) - (n - 1)));
        const star = (
          <span className="star" style={{ '--fill': `${Math.round(fill * 100)}%` }} aria-hidden="true">
            ★
          </span>
        );
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => onChange(n)}>
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}

// "Rate the course": 1-5 stars on conditions, layout, price, difficulty.
// course: { key, name }. Shows nothing for hand-typed courses (no shared id).
export function RateCourse({ course, rated, onRated }) {
  const key = rateableKey(course?.key);
  const [stars, setStars] = useState({});
  const [status, setStatus] = useState(rated ? 'done' : 'idle'); // idle | saving | done | error
  const [error, setError] = useState('');

  useEffect(() => {
    if (!key) return;
    myCourseRating(key).then((r) => r && setStars(r));
  }, [key]);

  if (!key) return null;
  const complete = RATING_CATEGORIES.every((c) => stars[c.key]);
  const save = async () => {
    setStatus('saving');
    try {
      await rateCourse({ key, name: course.name }, Object.fromEntries(RATING_CATEGORIES.map((c) => [c.key, stars[c.key]])));
      setStatus('done');
      onRated?.();
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  };

  if (status === 'done') {
    return (
      <section className="card rate-card">
        <p className="share-status">Thanks for rating {course.name} ✓</p>
        <button className="btn btn-ghost full" onClick={() => setStatus('idle')}>
          Change my rating
        </button>
      </section>
    );
  }
  return (
    <section className="card rate-card">
      <h3>Rate {course.name}</h3>
      <p className="hint">Helps other golfers pick where to play. Shows on the course’s page.</p>
      <ul className="rate-rows">
        {RATING_CATEGORIES.map((c) => (
          <li key={c.key}>
            <span className="rate-label">
              <strong>{c.label}</strong>
              <em>{c.hint}</em>
            </span>
            <Stars value={stars[c.key]} label={c.label} onChange={(n) => setStars((s) => ({ ...s, [c.key]: n }))} />
          </li>
        ))}
      </ul>
      {status === 'error' && <p className="search-error">{error}</p>}
      <button className="btn btn-primary btn-xl" disabled={!complete || status === 'saving'} onClick={save}>
        {status === 'saving' ? 'Saving…' : complete ? 'Submit rating' : 'Tap stars for all 4'}
      </button>
    </section>
  );
}
