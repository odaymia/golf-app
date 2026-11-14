// Sign-in, profile and saved players. The only module that talks to Supabase.
// The last profile and player list are cached on the phone so setup still
// works with no signal on the course.
import { supabase } from './supabase.js';

const CACHE_KEY = 'golf-app:account-cache';

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function writeCache(patch) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...readCache(), ...patch }));
  } catch {
    // storage blocked; we just lose the offline copy
  }
}

function friendly(error) {
  const msg = error?.message ?? String(error);
  if (/fetch|network|Failed to fetch|Load failed/i.test(msg)) return 'No connection. Try again when you have signal.';
  if (/rate limit|too many/i.test(msg)) return 'Too many codes sent. Wait a few minutes and try again.';
  if (/expired|invalid/i.test(msg)) return 'That code is wrong or expired. Check it, or send a new one.';
  return msg;
}

async function call(promise) {
  let result;
  try {
    result = await promise;
  } catch (e) {
    throw new Error(friendly(e));
  }
  if (result.error) throw new Error(friendly(result.error));
  return result.data;
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

// --- Auth ---------------------------------------------------------------

export function sendCode(email) {
  return call(supabase.auth.signInWithOtp({ email: normalizeEmail(email), options: { shouldCreateUser: true } }));
}

export async function verifyCode(email, code) {
  const data = await call(
    supabase.auth.verifyOtp({ email: normalizeEmail(email), token: String(code).trim(), type: 'email' }),
  );
  return data.session;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signOut() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // nothing cached
  }
  await supabase.auth.signOut({ scope: 'local' });
}

// --- Profile ------------------------------------------------------------

const toProfile = (row, user) => ({
  id: user.id,
  email: user.email,
  name: row?.name ?? '',
  ghinNumber: row?.ghin_number ?? '',
  index: row?.handicap_index == null ? null : Number(row.handicap_index),
  homeCourse: row?.home_course ?? '',
});

// Returns the profile, from the server when reachable, else the phone's copy.
export async function loadProfile(user) {
  try {
    const row = await call(supabase.from('profiles').select('*').eq('id', user.id).maybeSingle());
    const profile = toProfile(row, user);
    writeCache({ profile });
    return profile;
  } catch (e) {
    const cached = readCache().profile;
    if (cached?.id === user.id) return cached;
    throw e;
  }
}

export async function saveProfile(user, profile) {
  const row = await call(
    supabase
      .from('profiles')
      .upsert({
        id: user.id,
        name: profile.name.trim(),
        ghin_number: profile.ghinNumber.trim() || null,
        handicap_index: profile.index,
        home_course: profile.homeCourse.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single(),
  );
  const saved = toProfile(row, user);
  writeCache({ profile: saved });
  return saved;
}

// --- Saved players --------------------------------------------------------

const toPlayer = (row) => ({
  id: row.id,
  name: row.name,
  ghinNumber: row.ghin_number ?? '',
  index: row.handicap_index == null ? null : Number(row.handicap_index),
});

export async function listSavedPlayers() {
  try {
    const rows = await call(supabase.from('saved_players').select('*').order('name'));
    const players = rows.map(toPlayer);
    writeCache({ players });
    return players;
  } catch (e) {
    const cached = readCache().players;
    if (cached) return cached;
    throw e;
  }
}

export async function savePlayer(player) {
  const row = {
    name: player.name.trim(),
    ghin_number: player.ghinNumber.trim() || null,
    handicap_index: player.index,
    updated_at: new Date().toISOString(),
  };
  const query = player.id
    ? supabase.from('saved_players').update(row).eq('id', player.id).select().single()
    : supabase.from('saved_players').insert(row).select().single();
  const saved = toPlayer(await call(query));
  const others = (readCache().players ?? []).filter((p) => p.id !== saved.id);
  writeCache({ players: [...others, saved].sort((a, b) => a.name.localeCompare(b.name)) });
  return saved;
}

export async function deletePlayer(id) {
  await call(supabase.from('saved_players').delete().eq('id', id));
  writeCache({ players: (readCache().players ?? []).filter((p) => p.id !== id) });
}
