// Where the player is (the round they're scoring), kept on the phone so
// closing the app or turning the phone off and opening it again lands them
// back on the same screen. localStorage survives the app being killed;
// sessionStorage didn't. Old places expire so a round from yesterday
// doesn't take over the app.
//
// place: { roundId, screen: 'play'|'settle' }       casual round
//      | { leagueId, eventId, tab: 'score' }         league/tournament scoring

const KEY = 'golf-app:place';
export const PLACE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function readPlace(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const p = JSON.parse(storage.getItem(KEY));
    if (!p || typeof p !== 'object') return null;
    if (!p.at || now - p.at > PLACE_MAX_AGE_MS) return null;
    return p;
  } catch {
    return null;
  }
}

export function writePlace(place, storage = globalThis.localStorage, now = Date.now()) {
  try {
    if (place) storage.setItem(KEY, JSON.stringify({ ...place, at: now }));
    else storage.removeItem(KEY);
  } catch {
    // storage blocked: nothing to restore later, which is fine
  }
}
