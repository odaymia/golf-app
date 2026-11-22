// Course search + detail. The only module that reads the course database.
// First choice: our own copy in Supabase (public.courses, loaded from the
// open OpenGolfAPI data by supabase/courses.sql; ODbL), so search works
// when api.opengolfapi.org is down. Fallback: the OpenGolfAPI itself
// (no API key: per-device daily limit; nothing secret ships in a PWA).
import { courseFromApi } from './courseImport.js';
import { keyWords, matchScore, rankClose } from './fuzzy.js';
import { supabase } from './supabase.js';

const BASE = 'https://api.opengolfapi.org/api/v1';
// When the course database is down its requests hang ~20 s; give up sooner.
const TIMEOUT_MS = 8000;

export const DOWN_MESSAGE = 'The course database isn’t responding right now. Pick a course saved on this phone, or add it as a new course.';

async function get(path, signal) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
  } catch (e) {
    if (timedOut) throw new Error(DOWN_MESSAGE);
    if (e.name === 'AbortError') throw e;
    throw new Error('No connection. Pick a course saved on this phone, or add it as a new course.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  if (res.status === 429) throw new Error('Course search is busy right now. Try again in a bit.');
  if (res.status >= 500) throw new Error(DOWN_MESSAGE);
  if (!res.ok) throw new Error(`Course search failed (${res.status}).`);
  return res.json();
}

// Courses saved on this phone that match what's typed (works offline and
// when the course database is down). saved: [{ id, name, ... }].
export function matchSaved(query, saved) {
  const q = query.trim();
  if (q.length < 2) return [];
  const want = keyWords(q);
  return saved
    .map((c) => {
      const name = (c.name ?? '').toLowerCase();
      const hit = want.length ? (want.every((w) => name.includes(w)) ? 0 : matchScore(q, c.name)) : name.includes(q.toLowerCase()) ? 0 : null;
      return { c, hit };
    })
    .filter((x) => x.hit != null)
    .sort((a, b) => a.hit - b.hit)
    .map((x) => x.c);
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

// A row from our courses table -> the OpenGolfAPI detail shape courseFromApi
// reads (so both sources import the same way). Pure.
export function detailFromRow(row) {
  return {
    id: row.id,
    course_name: row.name,
    city: row.city,
    state: row.state,
    holes: row.holes,
    par: row.par,
    holes_data: (row.scorecard ?? []).map((h) => ({ number: h.hole, par: h.par, handicap_index: h.handicap_index })),
    tees: [], // the open data has no tee ratings; setup asks for them
  };
}

const fromRow = (r) => ({
  id: r.id,
  name: r.name,
  place: [r.city, r.state].filter(Boolean).join(', '),
  holes: r.holes,
  par: r.par,
  lat: typeof r.lat === 'number' ? r.lat : null,
  lng: typeof r.lng === 'number' ? r.lng : null,
  type: r.type ?? '',
  ...(r.exact ? {} : { similar: true }),
});

// Our Supabase copy. null when it isn't there or fails (use OpenGolfAPI).
async function searchOurs(q, signal) {
  try {
    let call = supabase.rpc('search_courses', { q, lim: 15 });
    if (signal) call = call.abortSignal(signal);
    const { data, error } = await call;
    if (error || !Array.isArray(data)) return null;
    if (!data.length && !(await haveOurs())) return null;
    return data.map(fromRow);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return null;
  }
}

// Is our copy loaded? (Checked once; an empty table means use OpenGolfAPI.)
let oursLoaded = null;
async function haveOurs() {
  if (oursLoaded != null) return oursLoaded;
  const { data, error } = await supabase.from('courses').select('id').limit(1);
  oursLoaded = !error && Array.isArray(data) && data.length > 0;
  return oursLoaded;
}

// [{ id, name, place, holes, par, lat, lng, type, similar? }]
// Our copy matches typos itself (similar = close names, not exact). The
// OpenGolfAPI only matches the exact letters typed, so when that finds few
// courses we also search each word on its own and add names that are close
// ("steel canyon" -> Steele Canyon), marked `similar`.
export async function searchCourses(query, { signal } = {}) {
  const q = query.trim();
  if (q.length < 3) return [];
  const ours = await searchOurs(q, signal);
  if (ours) return ours;
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
  try {
    let call = supabase.from('courses').select('id, name, city, state, holes, par, scorecard').eq('id', id).maybeSingle();
    if (signal) call = call.abortSignal(signal);
    const { data, error } = await call;
    if (!error && data) return courseFromApi(detailFromRow(data));
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
  }
  const detail = await get(`/courses/${encodeURIComponent(id)}`, signal);
  return courseFromApi(detail);
}
