// The only code touching course ratings and the AI round recap
// (supabase/course_ratings.sql, supabase/functions/round-recap).
import { supabase } from './supabase.js';
import { rateableKey, matchCourseKey } from './roundRecap.js';
import { BUILTIN_COURSES } from './builtinCourses.js';
import { searchCourses } from './courseSearch.js';

// A course's shared id for ratings: its own key, else an exact name match in
// the built-in courses, else in the course search. null when unsure.
export async function resolveCourseKey(course) {
  if (rateableKey(course?.key)) return course.key;
  if (!course?.name) return null;
  const builtin = matchCourseKey(course.name, BUILTIN_COURSES.map((c) => ({ key: c.id, name: c.name })));
  if (builtin) return builtin;
  try {
    const found = await searchCourses(course.name);
    return matchCourseKey(course.name, found.filter((c) => !c.similar).map((c) => ({ key: `oga-${c.id}`, name: c.name })));
  } catch {
    return null;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Ask the round-recap Edge Function for a recap of these facts.
// opts: { focus: player name (their own recap), eventId + groupKey (league
// rounds: shared, written once; if a groupmate is writing it, wait for it) }.
export async function requestRecap(facts, opts = {}) {
  for (let tries = 0; tries < 20; tries++) {
    const data = await callRecap({ facts, ...opts });
    if (!data.writing) return data.recap;
    await wait(4000);
  }
  throw new Error('Still writing. Check back in a minute.');
}

async function callRecap(body) {
  const { data, error } = await supabase.functions.invoke('round-recap', { body });
  if (error) {
    let msg = '';
    try {
      msg = (await error.context?.json?.())?.error ?? '';
    } catch {
      // not JSON
    }
    if (!msg && /Failed to send|fetch/i.test(error.message)) msg = 'No signal. The recap will be here when you’re back online.';
    throw new Error(msg || 'Couldn’t write a recap. Try again.');
  }
  return data;
}

export async function myCourseRating(courseKey) {
  if (!rateableKey(courseKey)) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data, error } = await supabase
    .from('course_ratings')
    .select('conditions, layout, price, difficulty')
    .eq('course_key', courseKey)
    .eq('user_id', u.user.id)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function rateCourse(course, stars) {
  const key = rateableKey(course.key);
  if (!key) throw new Error('This course can’t be rated.');
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('Sign in to rate courses.');
  const { error } = await supabase.from('course_ratings').upsert(
    { user_id: u.user.id, course_key: key, course_name: course.name ?? '', ...stars },
    { onConflict: 'user_id,course_key' },
  );
  if (error) throw new Error(/course_ratings/.test(error.message) ? 'Ratings aren’t set up yet.' : error.message);
  summaryCache.delete(key);
}

// { [courseKey]: { ratings, conditions, layout, price, difficulty } }, cached
// for the session so lists don't refetch.
const summaryCache = new Map();
export async function courseRatingSummaries(keys) {
  const want = [...new Set(keys.map(rateableKey).filter(Boolean))];
  const missing = want.filter((k) => !summaryCache.has(k));
  if (missing.length) {
    const { data, error } = await supabase.rpc('course_rating_summary', { p_keys: missing });
    if (error) return Object.fromEntries(want.filter((k) => summaryCache.get(k)).map((k) => [k, summaryCache.get(k)]));
    for (const k of missing) summaryCache.set(k, null);
    for (const r of data ?? []) {
      summaryCache.set(r.course_key, {
        ratings: Number(r.ratings),
        conditions: Number(r.conditions),
        layout: Number(r.layout),
        price: Number(r.price),
        difficulty: Number(r.difficulty),
      });
    }
  }
  return Object.fromEntries(want.filter((k) => summaryCache.get(k)).map((k) => [k, summaryCache.get(k)]));
}
