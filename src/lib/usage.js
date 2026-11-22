// Usage numbers for the owner dashboard (supabase/admin_stats.sql): one
// "opened the app today" per person per day, and casual rounds started (those
// live only on the phone). Nothing else is tracked. Always fails soft: the
// app never waits on or shows an error for these.
import { supabase } from './supabase.js';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const key = (userId) => `golf-app:visit:${userId}`;

// At most one call a day per person on this phone.
export async function logVisit(userId, storage = globalThis.localStorage) {
  if (!userId) return;
  try {
    if (storage.getItem(key(userId)) === today()) return;
    const { error } = await supabase.rpc('log_visit');
    if (!error) storage.setItem(key(userId), today());
  } catch {
    // offline, or admin_stats.sql not run yet
  }
}

export async function logEvent(kind) {
  try {
    await supabase.rpc('log_event', { p_kind: kind });
  } catch {
    // fail soft
  }
}
