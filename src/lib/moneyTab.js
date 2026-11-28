// Running tabs in Supabase (supabase/money_tab.sql). The only code touching
// tab_entries. The last copy is kept on the phone so tabs show with no
// signal; adding a round and marking paid need signal.
import { supabase } from './supabase.js';

const CACHE = 'golf-app:tab:';
const offline = (e) => /fetch|network|Load failed|Failed to fetch/i.test(e?.message ?? String(e));

function nice(error) {
  const msg = error?.message ?? String(error);
  if (offline(error)) return 'No connection. Try again when you have signal.';
  if (/JWT/i.test(msg)) return 'Your sign-in needs a refresh. Close and reopen the app, then try again.';
  if (/tab_entries|add_to_tab|mark_tab_paid|tab_sources_added/.test(msg) && /exist|find|schema/i.test(msg))
    return 'Running tabs aren’t set up yet (run supabase/money_tab.sql).';
  return msg;
}
async function call(promise) {
  let res;
  try {
    res = await promise;
  } catch (e) {
    throw new Error(nice(e));
  }
  if (res.error) throw new Error(nice(res.error));
  return res.data;
}

// Every tab entry I'm in (newest first). Falls back to the phone's copy.
export async function loadTab(me) {
  try {
    const rows = await call(
      supabase
        .from('tab_entries')
        .select('id, kind, source, label, from_user, to_user, from_name, to_name, cents, created_at')
        .or(`from_user.eq.${me},to_user.eq.${me}`)
        .order('created_at', { ascending: false })
        .limit(2000),
    );
    try {
      localStorage.setItem(CACHE + me, JSON.stringify(rows));
    } catch {
      // storage full
    }
    return rows;
  } catch (e) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE + me));
      if (cached) return cached;
    } catch {
      // nothing saved
    }
    throw e;
  }
}

// Which of these sources ('casual:<id>', 'set:<event>:<set>') are already on the tab.
export async function sourcesAdded(sources) {
  if (!sources.length) return new Set();
  return new Set(await call(supabase.rpc('tab_sources_added', { p_sources: sources })));
}

// Put one round's (or set's) settle-up on the running tab. rows: lib/tab.js tabRows.
export function addToTab(source, label, rows) {
  return call(supabase.rpc('add_to_tab', { p_source: source, p_label: label, p_payments: rows }));
}

// I got paid `cents` by `from` (all or part of what they owe me).
export function markPaid(from, cents, fromName, toName) {
  return call(supabase.rpc('mark_tab_paid', { p_from: from, p_cents: cents, p_from_name: fromName, p_to_name: toName }));
}

// Take back a "paid" I recorded by mistake.
export function undoPaid(id) {
  return call(supabase.from('tab_entries').delete().eq('id', id));
}

export function tabChanged() {
  window.dispatchEvent(new Event('scribble:tab-changed'));
}
