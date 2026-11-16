// Close-match scoring for course names, so "steel canyon" or "stele canyon"
// still finds "Steele Canyon Golf Club". Pure, no network.

// Words that don't tell courses apart (ignored when matching).
const FILLER = new Set(['golf', 'club', 'course', 'courses', 'country', 'cc', 'gc', 'the', 'at', 'of', 'and', '&', 'links']);

export function words(text) {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// The words worth searching for and matching on.
export const keyWords = (text) => words(text).filter((w) => !FILLER.has(w));

// Edit distance (insert, delete, change one letter), stopping early past max.
export function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Typos allowed for a word of this length.
const allowed = (w) => (w.length <= 3 ? 0 : w.length <= 6 ? 1 : 2);

// How far a typed word is from the closest word in a name (0 = exact or the
// start of a name word), or null if none is close enough.
function wordCost(q, nameWords) {
  let best = null;
  for (const n of nameWords) {
    let cost;
    if (n === q || (q.length >= 3 && n.startsWith(q))) cost = 0;
    else {
      const d = editDistance(q, n, 2);
      // Also compare with the name word cut to the typed length ("steel" vs "steele").
      const cut = n.length > q.length ? editDistance(q, n.slice(0, q.length), 2) + 0.5 : Infinity;
      cost = Math.min(d, cut);
      if (cost > allowed(q) + 0.5) continue;
    }
    if (best === null || cost < best) best = cost;
  }
  return best;
}

// Score a course name against what was typed: lower is better, null = not a
// match. Every meaningful typed word must be close to some word in the name.
export function matchScore(query, name) {
  const qw = keyWords(query);
  if (!qw.length) return null;
  const nw = words(name);
  let total = 0;
  for (const q of qw) {
    const c = wordCost(q, nw);
    if (c === null) return null;
    total += c;
  }
  return total;
}

// Keep the close matches, best first (ties: shorter name first).
export function rankClose(query, items, nameOf = (x) => x.name) {
  return items
    .map((x) => ({ x, s: matchScore(query, nameOf(x)) }))
    .filter((r) => r.s !== null)
    .sort((a, b) => a.s - b.s || nameOf(a.x).length - nameOf(b.x).length)
    .map((r) => r.x);
}
