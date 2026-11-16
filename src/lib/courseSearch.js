// OpenGolfAPI client. The only module that calls the course database.
// Search and course detail need no API key (per-device daily limit), so no
// key ships in the app: anything in a public PWA is readable by anyone.
import { courseFromApi } from './courseImport.js';
import { keyWords, rankClose } from './fuzzy.js';

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

const toResult = (c) => ({
  id: c.id,
  name: c.course_name,
  place: [c.city, c.state].filter(Boolean).join(', '),
  holes: c.holes,
  par: c.par,
  lat: typeof c.lat === 'number' ? c.lat : null,
  lng: typeof c.lng === 'number' ? c.lng : null,
  type: c.type ?? '',
});

async function rawSearch(q, limit, signal) {
  const data = await get(`/courses/search?q=${encodeURIComponent(q)}&limit=${limit}`, signal);
  return (data.courses ?? []).map(toResult);
}

// [{ id, name, place, holes, par, lat, lng, type, similar? }]
// The course database only matches the exact letters typed, so when that
// finds few courses we also search each word on its own and add names that
// are close ("steel canyon" -> Steele Canyon), marked `similar`.
export async function searchCourses(query, { signal } = {}) {
  const q = query.trim();
  if (q.length < 3) return [];
  const exact = await rawSearch(q, 15, signal);
  if (exact.length >= 5) return exact;
  const parts = [...new Set(keyWords(q).filter((w) => w.length >= 3))].sort((a, b) => b.length - a.length).slice(0, 3);
  if (!parts.length || (parts.length === 1 && parts[0] === q.toLowerCase())) return exact;
  const pools = await Promise.all(parts.map((w) => rawSearch(w, 100, signal).catch(() => [])));
  const seen = new Set(exact.map((c) => c.id));
  const pool = pools.flat().filter((c) => !seen.has(c.id) && (seen.add(c.id), true));
  const close = rankClose(q, pool).map((c) => ({ ...c, similar: true }));
  return [...exact, ...close].slice(0, 15);
}

// { course, warnings } ready for the setup screen.
export async function fetchCourse(id, { signal } = {}) {
  const detail = await get(`/courses/${encodeURIComponent(id)}`, signal);
  return courseFromApi(detail);
}
