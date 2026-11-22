// Plain-English lines describing where each game stands.
import { GAME_INFO } from '../lib/roundSetup.js';
import { formatMoney } from '../lib/games/money.js';

export function nameMap(players) {
  return Object.fromEntries(players.map((p) => [p.id, p.name]));
}

const side = (names, ids) => ids.map((id) => names[id]).join(' & ');

export function matchText(status, nameA, nameB) {
  const { up, played, remaining, closedOut, complete } = status;
  if (played === 0) return 'Not started';
  if (up === 0) return complete ? 'Halved' : `All square thru ${played}`;
  const leader = up > 0 ? nameA : nameB;
  const wins = leader.includes(' & ') ? 'win' : 'wins';
  const n = Math.abs(up);
  if (closedOut && remaining > 0) return `${leader} ${wins} ${n} & ${remaining}`;
  if (complete) return `${leader} ${wins} ${n} up`;
  if (n === remaining) return `${leader} ${n} up (dormie)`;
  return `${leader} ${n} up thru ${played}`;
}

export function gameTitle(game) {
  return GAME_INFO[game.type]?.name ?? game.type;
}

// Returns [{ text, sub? }]
export function gameLines(result, players) {
  const names = nameMap(players);
  const { game } = result;
  switch (game.type) {
    case 'nassau':
      return result.matchups.flatMap((m) => {
        const [a, b] = m.sides.map((s) => side(names, s));
        const lines = [];
        if (result.matchups.length > 1) lines.push({ text: `${a} vs ${b}`, head: true });
        for (const seg of m.segments) {
          seg.bets.forEach((bet, i) => {
            const label = i === 0 ? seg.label : `↳ Press from ${bet.hole}${bet.auto ? ' (auto)' : ''}`;
            lines.push({ text: `${label}: ${matchText(bet.status, a, b)}`, sub: i > 0 });
          });
        }
        return lines;
      });
    case 'match':
      return result.matchups.map((m) => {
        const [a, b] = m.sides.map((s) => side(names, s));
        return { text: `${m.range ? `${stretchLabel(m)}: ` : ''}${a} vs ${b}: ${matchText(m.status, a, b)}` };
      });
    case 'skins': {
      const lines = players
        .filter((p) => result.won[p.id] > 0)
        .map((p) => ({ text: `${p.name}: ${result.won[p.id]} skin${result.won[p.id] > 1 ? 's' : ''}` }));
      if (!lines.length) lines.push({ text: 'No skins won yet' });
      if (result.pending)
        lines.push({
          text: `${names[result.pending.winner]} must validate ${result.pending.value} skin${result.pending.value > 1 ? 's' : ''}`,
          sub: true,
        });
      if (result.carry > 0 && result.thru < 18)
        lines.push({ text: `${result.carry} skin${result.carry > 1 ? 's' : ''} carrying over`, sub: true });
      if (result.carry > 0 && result.thru === 18)
        lines.push({ text: `${result.carry} unclaimed after 18`, sub: true });
      return lines;
    }
    case 'stableford': {
      if (result.teamTotals) {
        const [a, b] = game.teams.map((t) => side(names, t));
        const [ta, tb] = result.teamTotals;
        const lead = ta === tb ? 'All square' : `${ta > tb ? a : b} up ${Math.abs(ta - tb)}`;
        return [{ text: `${a} ${ta} pts · ${b} ${tb} pts` }, { text: `${lead}${result.thru < 18 ? ` thru ${result.thru}` : ''}`, sub: true }];
      }
      return result.standings.map((s, i) => ({
        text: `${i + 1}. ${names[s.id]}: ${s.total} pts${s.thru < 18 ? ` thru ${s.thru}` : ''}`,
      }));
    }
    case 'stroke':
      return result.standings.map((s, i) => ({
        text: `${i + 1}. ${names[s.id]}: ${s.total}${s.thru < 18 ? ` thru ${s.thru}` : ''}`,
      }));
    case 'wolf': {
      const played = result.holes.filter((h) => h.amount !== undefined);
      const lines = played.slice(-4).map((h) => {
        const who =
          h.kind === 'partner'
            ? `${names[h.wolf]} + ${names[h.decision.partner]}`
            : `${names[h.wolf]} ${h.kind === 'blind' ? 'blind' : 'lone'} wolf`;
        const res = h.result === 'push' ? 'push' : h.result === 'wolf won' ? 'won' : 'lost';
        return { text: `Hole ${h.hole}: ${who} ${res}` };
      });
      if (!lines.length) lines.push({ text: 'No holes played yet' });
      return lines;
    }
    case 'places': {
      const paid = [...result.standings].filter((s) => s.position != null).sort((a, b) => a.position - b.position);
      if (!paid.length) return [{ text: 'No holes everyone has finished yet' }];
      const tied = (s) => paid.filter((o) => o.position === s.position).length > 1;
      return [
        { text: `Pot ${formatMoney(result.purse)}${result.thru < 18 ? ` · thru ${result.thru}` : ''}`, head: true },
        ...paid.map((s) => ({
          text: `${tied(s) ? 'T' : ''}${s.position}. ${names[s.id]}: ${s.total}${s.cents > 0 ? ` · wins ${formatMoney(s.cents)}` : ''}`,
        })),
      ];
    }
    case 'vegas': {
      const [a, b] = game.teams.map((t) => side(names, t));
      const p = result.points;
      return [{ text: p === 0 ? 'All square' : `${p > 0 ? a : b} up ${Math.abs(p)} point${Math.abs(p) > 1 ? 's' : ''}` }];
    }
    default:
      return [];
  }
}

// A split match's stretch: "Holes 1–6 · Best ball".
const STRETCH_WORDS = { fourball: 'Best ball', shamble: 'Combined', singles: 'Singles' };
export const stretchLabel = (m) => `Holes ${m.range[0] + 1}–${m.range[1] + 1} · ${STRETCH_WORDS[m.format] ?? m.format}`;
