import { useEffect, useState } from 'react';
import { courseRatingSummaries } from '../lib/courseRatings.js';
import { RATING_CATEGORIES, overallStars } from '../lib/roundRecap.js';
import { Stars } from './RoundRecap.jsx';

// Rating summaries for a list of course keys: { [key]: summary }.
export function useCourseRatings(keys) {
  const [map, setMap] = useState({});
  const sig = keys.join('|');
  useEffect(() => {
    if (!sig) return;
    let live = true;
    courseRatingSummaries(sig.split('|')).then((m) => live && setMap(m));
    return () => {
      live = false;
    };
  }, [sig]);
  return map;
}

// Inline "★ 4.3 (12)" for lists.
export function RatingBadge({ summary }) {
  const o = overallStars(summary);
  if (!o) return null;
  return (
    <span className="rating-badge" aria-label={`${o} stars from ${summary.ratings} ratings`}>
      ★ {o.toFixed(1)} <span>({summary.ratings})</span>
    </span>
  );
}

// The course page block: overall stars and each category.
export function RatingSummary({ summary }) {
  if (!summary) return <p className="hint rating-empty">No ratings yet. Golfers rate a course after their round.</p>;
  const o = overallStars(summary);
  return (
    <div className="rating-summary">
      <div className="rating-overall">
        <strong>{o?.toFixed(1)}</strong>
        <Stars value={o} size="small" />
        <span className="muted">
          {summary.ratings} rating{summary.ratings === 1 ? '' : 's'}
        </span>
      </div>
      <ul className="rating-cats">
        {RATING_CATEGORIES.filter((c) => summary[c.key] != null).map((c) => (
          <li key={c.key}>
            <span>{c.label}</span>
            <span className="rating-bar" aria-hidden="true">
              <span style={{ width: `${(summary[c.key] / 5) * 100}%` }} />
            </span>
            <strong>{summary[c.key].toFixed(1)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
