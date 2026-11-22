import { useEffect, useState } from 'react';
import { listCoursePosts } from '../../lib/social.js';
import { timeAgo } from '../../lib/socialFormat.js';
import PostGrid from './PostGrid.jsx';
import { RatingSummary, useCourseRatings } from '../CourseRatings.jsx';
import { rateableKey } from '../../lib/roundRecap.js';

// "2h ago", "just now", or a date for older posts.
const agoText = (iso) => {
  const t = timeAgo(iso);
  return /^\d+[mhdw]$/.test(t) ? `${t} ago` : t;
};

// A course's location page: the newest photos and videos tagged there, so
// golfers can check conditions before they play.
export default function CoursePage({ course, meId, nav, back }) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listCoursePosts(course.key, meId)
      .then(setPosts)
      .catch((e) => {
        setError(e.message);
        setPosts([]);
      });
  }, [course.key, meId]);

  const ratings = useCourseRatings(rateableKey(course.key) ? [course.key] : []);
  const latest = posts?.[0];
  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={back}>
          ‹ Back
        </button>
        <h1>📍 Course</h1>
        <span />
      </div>
      <section className="course-head">
        <h2>{course.name}</h2>
        {course.place && <p className="muted">{course.place}</p>}
        {rateableKey(course.key) && <RatingSummary summary={ratings[course.key]} />}
        <CourseMap course={course} />
        {posts && (
          <p className="course-meta">
            <strong>Recent photos</strong> · 
            {posts.length === 0
              ? 'No posts yet'
              : `${posts.length} post${posts.length === 1 ? '' : 's'} · latest ${agoText(latest.createdAt)}`}
          </p>
        )}
      </section>
      {error && <div className="card warn-box">{error}</div>}
      {posts === null ? (
        <p className="muted center">Loading…</p>
      ) : (
        <PostGrid
          posts={posts}
          onOpen={(p) => nav('posts', { posts, startId: p.id, title: course.name })}
          empty="Nobody has posted from here yet. Playing it soon? Share how it looks."
        />
      )}
      <p className="hint center">Newest first, so you see how the course looks right now.</p>
    </div>
  );
}

// Where the course is: a small map when we know the spot, and a link that
// opens the phone's maps app (by coordinates, or by name and town).
function CourseMap({ course }) {
  const has = typeof course.lat === 'number' && typeof course.lng === 'number';
  const query = has ? `${course.lat},${course.lng}` : [course.name, course.place].filter(Boolean).join(', ');
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const d = 0.012;
  const embed = has
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${course.lng - d * 1.6},${course.lat - d},${course.lng + d * 1.6},${course.lat + d}&layer=mapnik&marker=${course.lat},${course.lng}`
    : null;
  return (
    <div className="course-map">
      {embed && <iframe title={`Map of ${course.name}`} src={embed} loading="lazy" />}
      <a className="btn btn-ghost outline" href={maps} target="_blank" rel="noreferrer">
        📍 Open in Maps
      </a>
      {embed && <p className="hint">Map © OpenStreetMap contributors</p>}
    </div>
  );
}
