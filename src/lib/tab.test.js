import { describe, expect, it } from 'vitest';
import { parsePaid, tabRows, tabSummary, tabText, towardMe } from './tab.js';
import { formatMoney } from './games/money.js';

const players = [
  { id: 'p1', name: 'Omar Daymia', userId: 'me' },
  { id: 'p2', name: 'Mike Smith', userId: 'mike' },
  { id: 'p3', name: 'Dave Jones', userId: 'dave' },
];
let t = 0;
const round = (from, to, cents, source = 's') => ({ kind: 'round', source, from_user: from, to_user: to, from_name: from, to_name: to, cents, created_at: `2026-11-${String(++t).padStart(2, '0')}` });
const paid = (from, to, cents) => ({ kind: 'paid', from_user: from, to_user: to, from_name: from, to_name: to, cents, created_at: `2026-11-${String(++t).padStart(2, '0')}` });

describe('running tabs', () => {
  it('turns a settle-up into tab rows by account', () => {
    expect(tabRows([{ from: 'p2', to: 'p1', cents: 1400 }], players)).toEqual([
      { from_user: 'mike', to_user: 'me', from_name: 'Mike Smith', to_name: 'Omar Daymia', cents: 1400 },
    ]);
    expect(tabRows([{ from: 'p2', to: 'x', cents: 100 }], players)).toBe(null);
    expect(tabRows([], players)).toEqual([]);
  });

  it('adds up rounds both ways over months, and payments bring it down', () => {
    t = 0;
    const entries = [
      round('mike', 'me', 1400, 'r1'),
      round('me', 'mike', 600, 'r2'),
      round('mike', 'me', 2000, 'r3'),
      round('dave', 'me', 500, 'r3'),
      paid('mike', 'me', 1000),
    ];
    const tabs = tabSummary(entries, 'me');
    expect(tabs.map((x) => [x.userId, x.cents])).toEqual([
      ['mike', 1800], // 14 - 6 + 20 - 10
      ['dave', 500],
    ]);
    expect(tabs[0].entries[0].kind).toBe('paid'); // newest first
    // The other side sees the mirror image.
    expect(tabSummary(entries, 'mike')).toEqual([expect.objectContaining({ userId: 'me', cents: -1800 })]);
  });

  it('cashing out the whole tab makes it all square', () => {
    const entries = [round('mike', 'me', 2500), paid('mike', 'me', 2500)];
    const [m] = tabSummary(entries, 'me');
    expect(m.cents).toBe(0);
    expect(tabText(m, formatMoney)).toBe('All square with mike');
  });

  it('every entry nets to zero between the two people', () => {
    for (const e of [round('a', 'b', 300), paid('a', 'b', 300)]) expect(towardMe(e, 'a') + towardMe(e, 'b')).toBe(0);
    expect(towardMe(round('a', 'b', 300), 'c')).toBe(0);
  });

  it('says who owes who', () => {
    expect(tabText({ name: 'Mike Smith', cents: 4200 }, formatMoney)).toBe('Mike owes you $42');
    expect(tabText({ name: 'Mike Smith', cents: -1250 }, formatMoney)).toBe('You owe Mike $12.50');
  });

  it('reads a typed amount, never more than owed', () => {
    expect(parsePaid('$20', 4200)).toBe(2000);
    expect(parsePaid('12.5', 4200)).toBe(1250);
    expect(parsePaid('1,000', 200000)).toBe(100000);
    expect(parsePaid('50', 4200)).toBe(null);
    expect(parsePaid('0', 4200)).toBe(null);
    expect(parsePaid('abc', 4200)).toBe(null);
  });
});
