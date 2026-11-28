// Running tabs: what friends owe each other across rounds (supabase/
// money_tab.sql). Pure: no React or network (lib/moneyTab.js sends). All
// money is integer cents. Scribble only keeps track; it never moves money.
//
// Entries: { kind: 'round' | 'paid', source, label, from_user, to_user,
// from_name, to_name, cents, created_at }. 'round': from_user owes to_user
// (a round's settle-up added to the tab). 'paid': from_user paid to_user.

// Settle-up payments ({ from, to, cents } by player id) -> tab rows by
// account. Returns null if anyone in a payment has no account.
export function tabRows(payments, players) {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const rows = [];
  for (const p of payments) {
    const from = byId[p.from];
    const to = byId[p.to];
    if (!from?.userId || !to?.userId) return null;
    if (from.userId === to.userId || !(p.cents > 0)) continue;
    rows.push({ from_user: from.userId, to_user: to.userId, from_name: from.name, to_name: to.name, cents: p.cents });
  }
  return rows;
}

// What one entry does to "they owe me" for me: + they owe me more, - less.
export function towardMe(e, me) {
  if (e.kind === 'round') return e.to_user === me ? e.cents : e.from_user === me ? -e.cents : 0;
  if (e.kind === 'paid') return e.to_user === me ? -e.cents : e.from_user === me ? e.cents : 0;
  return 0;
}

// Every running tab I'm in: [{ userId, name, cents, entries }], cents > 0 =
// they owe me, < 0 = I owe them. Newest entries first; biggest tabs first,
// then settled ones.
export function tabSummary(entries, me) {
  const byUser = new Map();
  const sorted = [...(entries ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  for (const e of sorted) {
    if (e.from_user !== me && e.to_user !== me) continue;
    const other = e.from_user === me ? e.to_user : e.from_user;
    const name = e.from_user === me ? e.to_name : e.from_name;
    if (!byUser.has(other)) byUser.set(other, { userId: other, name: name || 'Golfer', cents: 0, entries: [] });
    const t = byUser.get(other);
    t.cents += towardMe(e, me);
    t.entries.push(e);
  }
  return [...byUser.values()].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents) || a.name.localeCompare(b.name));
}

// "Mike owes you $42" / "You owe Mike $42" / "All square with Mike".
export function tabText(t, format) {
  const first = t.name.split(' ')[0];
  if (t.cents > 0) return `${first} owes you ${format(t.cents)}`;
  if (t.cents < 0) return `You owe ${first} ${format(-t.cents)}`;
  return `All square with ${first}`;
}

// Parse a typed dollar amount to cents (1 to max); null if it isn't one.
export function parsePaid(text, max) {
  const n = Number(String(text).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  if (cents <= 0 || cents > max) return null;
  return cents;
}
