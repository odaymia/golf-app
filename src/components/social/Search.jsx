import { ATTRIBUTION } from '../../lib/courseImport.js';
import { useEffect, useRef, useState } from 'react';
import { searchPosts, searchProfiles } from '../../lib/social.js';
import { searchCourses } from '../../lib/courseSearch.js';
import { instructorBadges } from '../../lib/instructors.js';
import { addRecent, clearRecent, listRecent, removeRecent, entryId } from '../../lib/searchHistory.js';
import Avatar from './Avatar.jsx';
import PostGrid from './PostGrid.jsx';

// Search: recent searches until you press Enter, then results in three
// tabs: For you (posts), Profiles, Golf courses.
// params.q / params.tab come back when you return to this screen.
export default function Search({ meId, nav, back, initial = {} }) {
  const [text, setText] = useState(initial.q ?? '');
  const [q, setQ] = useState(initial.q ?? ''); // the submitted search
  const [tab, setTab] = useState(initial.tab ?? 'posts');
  const [recent, setRecent] = useState(() => listRecent(meId));
  const input = useRef(null);

  useEffect(() => {
    if (!initial.q) input.current?.focus();
  }, [initial.q]);

  function submit(value = text) {
    const v = value.trim();
    if (!v) return;
    setText(v);
    setQ(v);
    setTab('posts');
    setRecent(addRecent(meId, { type: 'query', q: v }));
    input.current?.blur();
  }

  // Leave this screen remembering the search, so Back returns to it.
  const go = (name, params, entry) => {
    if (entry) setRecent(addRecent(meId, entry));
    nav(name, params, { q, tab });
  };

  const openRecent = (e) => {
    if (e.type === 'query') return submit(e.q);
    if (e.type === 'profile') return go('user', { userId: e.profile.id }, e);
    return go('course', { course: e.course }, e);
  };

  const editing = !q || text.trim() !== q;

  return (
    <div className="screen search-screen">
      <form
        className="search-top"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <button type="button" className="btn btn-ghost" onClick={back} aria-label="Back">
          ‹
        </button>
        <label className="search-field">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search golfers, courses, posts"
            aria-label="Search"
          />
          {text && (
            <button type="button" className="search-clear" onClick={() => (setText(''), input.current?.focus())} aria-label="Clear">
              ✕
            </button>
          )}
        </label>
      </form>

      {editing ? (
        <Recent
          recent={recent.filter((e) => !text.trim() || label(e).toLowerCase().includes(text.trim().toLowerCase()))}
          typed={text.trim()}
          onSearch={() => submit()}
          onOpen={openRecent}
          onRemove={(e) => setRecent(removeRecent(meId, e))}
          onClear={() => confirm('Clear your search history?') && setRecent(clearRecent(meId))}
          hasAny={recent.length > 0}
        />
      ) : (
        <>
          <div className="tabs wide-tabs search-tabs" role="tablist">
            {[
              ['posts', 'For you'],
              ['profiles', 'Profiles'],
              ['courses', 'Golf courses'],
            ].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          {tab === 'posts' && <PostResults q={q} meId={meId} go={go} />}
          {tab === 'profiles' && <ProfileResults q={q} meId={meId} go={go} />}
          {tab === 'courses' && <CourseResults q={q} go={go} />}
        </>
      )}
    </div>
  );
}

const label = (e) => (e.type === 'query' ? e.q : e.type === 'profile' ? e.profile.username || e.profile.displayName : e.course.name);

function Recent({ recent, typed, hasAny, onSearch, onOpen, onRemove, onClear }) {
  return (
    <section className="recent">
      {typed && (
        <button className="recent-row search-for" onClick={onSearch}>
          <span className="recent-icon">🔍</span>
          <span className="recent-text">
            Search for <strong>“{typed}”</strong>
          </span>
        </button>
      )}
      {!typed && <h3 className="recent-h">Recent</h3>}
      {!hasAny && !typed && <p className="muted center">Your recent searches show up here.</p>}
      <ul className="recent-list">
        {recent.map((e) => (
          <li key={entryId(e)}>
            <button className="recent-row" onClick={() => onOpen(e)}>
              {e.type === 'profile' ? (
                <Avatar profile={e.profile} size={40} />
              ) : (
                <span className="recent-icon">{e.type === 'course' ? '📍' : '🕘'}</span>
              )}
              <span className="recent-text">
                <strong>{label(e)}</strong>
                {e.type === 'profile' && e.profile.displayName && <em>{e.profile.displayName}</em>}
                {e.type === 'course' && e.course.place && <em>{e.course.place}</em>}
              </span>
            </button>
            <button className="recent-x" onClick={() => onRemove(e)} aria-label={`Remove ${label(e)}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {hasAny && !typed && (
        <button className="link clear-history" onClick={onClear}>
          Clear search history
        </button>
      )}
    </section>
  );
}

// Load a search's results once per query.
function useResults(fn, q) {
  const [state, setState] = useState({ q: null, items: null, error: '' });
  useEffect(() => {
    let live = true;
    fn(q)
      .then((items) => live && setState({ q, items, error: '' }))
      .catch((e) => live && setState({ q, items: [], error: e.message }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fn is stable per tab
  }, [q]);
  return state.q === q ? state : { items: null, error: '' };
}

function PostResults({ q, meId, go }) {
  const { items, error } = useResults((x) => searchPosts(x, meId), q);
  if (items === null) return <p className="muted center">Searching…</p>;
  return (
    <>
      {error && <div className="card warn-box">{error}</div>}
      <PostGrid
        posts={items}
        onOpen={(p) => go('posts', { posts: items, startId: p.id, title: q })}
        empty={`No photos or videos for “${q}” yet.`}
      />
    </>
  );
}

function ProfileResults({ q, meId, go }) {
  const { items, error } = useResults(async (x) => {
    const list = await searchProfiles(x, meId, { withHomeCourse: true, limit: 40 });
    const badges = await instructorBadges(list.map((p) => p.id));
    return list.map((p) => ({ ...p, teaches: badges.get(p.id) ?? null }));
  }, q);
  if (items === null) return <p className="muted center">Searching…</p>;
  return (
    <section className="results">
      {error && <div className="card warn-box">{error}</div>}
      {items.length === 0 && <p className="muted center">No golfers named “{q}”.</p>}
      <ul className="people-pick">
        {items.map((p) => (
          <li key={p.id}>
            <button onClick={() => go('user', { userId: p.id }, { type: 'profile', profile: { id: p.id, username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl } })}>
              <Avatar profile={p} size={44} />
              <span>
                <strong>
                  {p.username || p.displayName}
                  {p.teaches && <span className="mini-badge">{p.teaches.verified ? '✓ Instructor' : 'Instructor'}</span>}
                </strong>
                <em>
                  {p.displayName}
                  {p.matchedBy === 'home course' && p.homeCourse ? ` · ⛳ ${p.homeCourse}` : ''}
                </em>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CourseResults({ q, go }) {
  const { items, error } = useResults((x) => (x.trim().length < 3 ? Promise.resolve([]) : searchCourses(x)), q);
  if (items === null) return <p className="muted center">Searching courses…</p>;
  return (
    <section className="results">
      {error && <div className="card warn-box">{error}</div>}
      {items.length === 0 && !error && (
        <p className="muted center">{q.trim().length < 3 ? 'Type at least 3 letters to find a course.' : `No courses named “${q}”.`}</p>
      )}
      <ul className="course-results">
        {items.map((c) => {
          const course = { key: `oga-${c.id}`, name: c.name, place: c.place, lat: c.lat, lng: c.lng };
          return (
            <li key={c.id}>
              <button onClick={() => go('course', { course }, { type: 'course', course })}>
                <span className="recent-icon">📍</span>
                <span className="recent-text">
                  <strong>{c.name}</strong>
                  <em>
                    {[c.place, c.holes ? `${c.holes} holes` : '', c.par ? `par ${c.par}` : ''].filter(Boolean).join(' · ')}
                  </em>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {items.length > 0 && <p className="hint center">Course data {ATTRIBUTION}</p>}
    </section>
  );
}
