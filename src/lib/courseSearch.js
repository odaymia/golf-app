// OpenGolfAPI client. The only module that calls the course database.
// Search and course detail need no API key (per-device daily limit), so no
// key ships in the app: anything in a public PWA is readable by anyone.
import { courseFromApi } from './courseImport.js';

const BASE = 'https://api.opengolfapi.org/api/v1';

async function get(path, signal) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('No connection. Pick a saved course or enter it by hand.');
  }
  if (res.status === 429) throw new Error('Course search is busy right now. Try again in a bit.');
  if (!res.ok) throw new Error(`Course search failed (${res.status}).`);
  return res.json();
}

// [{ id, name, place, holes, par }]
export async function searchCourses(query, { signal } = {}) {
  const q = query.trim();
  if (q.length < 3) return [];
  const data = await get(`/courses/search?q=${encodeURIComponent(q)}&limit=15`, signal);
  return (data.courses ?? []).map((c) => ({
    id: c.id,
    name: c.course_name,
    place: [c.city, c.state].filter(Boolean).join(', '),
    holes: c.holes,
    par: c.par,
  }));
}

// { course, warnings } ready for the setup screen.
export async function fetchCourse(id, { signal } = {}) {
  const detail = await get(`/courses/${encodeURIComponent(id)}`, signal);
  return courseFromApi(detail);
}
