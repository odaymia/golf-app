// Commissioner (League Pro) helpers: roster import, season dates, CSV export.
// Pure, no network or DOM.
import { parseIndex } from '../roundSetup.js';

// Split one CSV/TSV line, honoring "quoted, values".
export function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const HEADERS = {
  name: /^(name|player|golfer|full ?name)$/i,
  first: /^first( ?name)?$/i,
  last: /^(last|surname)( ?name)?$/i,
  index: /^(index|handicap|hcp|hcap|hi|handicap index|h\.?i\.?)$/i,
  ghin: /^(ghin|ghin ?#|ghin ?number|ghin ?no\.?)$/i,
  email: /^(e-?mail|email address)$/i,
  team: /^(team|side|flight|squad)$/i,
};

// Read a pasted roster: from Excel/Google Sheets (tabs) or CSV (commas).
// With a header row, columns can be in any order (Name or First/Last,
// Email, Index/Handicap, GHIN, Team). Without one: name, index, GHIN, team,
// and an email address is picked up from whichever column has one.
// Returns { players: [{ name, email, index, ghinNumber, team }], problems: [{ line, message }] }.
export function parseRoster(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim());
  if (!lines.length) return { players: [], problems: [] };
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : ',';
  let cols = { name: 0, index: 1, ghin: 2, team: 3 };
  let start = 0;
  const head = splitLine(lines[0], sep);
  const found = {};
  head.forEach((h, i) => {
    for (const [key, re] of Object.entries(HEADERS)) if (re.test(h.trim()) && found[key] == null) found[key] = i;
  });
  if (found.name != null || found.first != null || found.last != null) {
    cols = found;
    start = 1;
  }
  const players = [];
  const problems = [];
  for (let i = start; i < lines.length; i++) {
    let cells = splitLine(lines[i], sep);
    let email = '';
    if (cols.email == null) {
      // No email column: take any cell that looks like an address out of the positional columns.
      const at = cells.findIndex((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim()));
      if (at >= 0) {
        email = cells[at].trim();
        cells = cells.filter((_, j) => j !== at);
      }
    }
    const get = (k) => (cols[k] == null ? '' : (cells[cols[k]] ?? '').trim());
    if (cols.email != null) email = get('email');
    const name = (get('name') || [get('first'), get('last')].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
    if (!name) {
      problems.push({ line: i + 1, message: 'No name' });
      continue;
    }
    const rawIndex = get('index');
    const index = parseIndex(rawIndex);
    if (index === null) {
      problems.push({ line: i + 1, message: `${name}: handicap "${rawIndex}" isn't a number` });
    }
    players.push({
      name,
      email: email.toLowerCase(),
      index: rawIndex === '' || index === null ? null : index,
      ghinNumber: get('ghin').replace(/\D/g, ''),
      team: get('team'),
    });
  }
  return { players, problems };
}

// Split an import into new players and ones already on the roster (same
// name, or an email already invited).
export function splitNew(players, existing) {
  const haveNames = new Set(existing.map((m) => m.name.trim().toLowerCase()));
  const haveEmails = new Set(existing.map((m) => (m.inviteEmail ?? '').toLowerCase()).filter(Boolean));
  const fresh = [];
  const dupes = [];
  const seen = new Set();
  for (const p of players) {
    const key = p.name.toLowerCase();
    const email = (p.email ?? '').toLowerCase();
    if (haveNames.has(key) || seen.has(key) || (email && (haveEmails.has(email) || seen.has(email)))) dupes.push(p);
    else {
      seen.add(key);
      if (email) seen.add(email);
      fresh.push(p);
    }
  }
  return { fresh, dupes };
}

// Dates for a season: count rounds starting on `start` (YYYY-MM-DD), every
// `everyDays` days. Calendar math on the date itself, so no time zone shifts.
export function seasonDates(start, count, everyDays = 7) {
  const [y, m, d] = start.split('-').map(Number);
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i * everyDays));
    return dt.toISOString().slice(0, 10);
  });
}

// Rows -> CSV text (Excel-friendly quoting).
export function toCSV(rows) {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? '' : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}

const fmt = (n) => (n == null ? '' : Number.isInteger(n) ? n : Math.round(n * 100) / 100);
const toPar = (n) => (n == null ? '' : n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

// Standings (league or tournament) as CSV rows, header first.
export function standingsRows(settings, standings, events = []) {
  const posOf = (r, i) =>
    r.position == null
      ? ''
      : standings.some((o, j) => j !== i && o.position === r.position)
        ? `T${r.position}`
        : `${r.position}`;
  if (settings.kind === 'tournament') {
    if (settings.unit === 'ryder') {
      return [
        ['Side', ...events.map((e, i) => e.name || `Round ${i + 1}`), 'Total'],
        ...standings.map((r) => [r.name, ...r.rounds.map(fmt), fmt(r.total)]),
      ];
    }
    const sf = settings.scoring === 'stableford';
    return [
      ['Pos', 'Name', sf ? 'Points' : 'To par', ...events.map((e, i) => e.name || `R${i + 1}`)],
      ...standings.map((r, i) => [
        posOf(r, i),
        r.name,
        !r.started ? '' : sf ? r.total : toPar(r.toPar),
        ...r.rounds.map((x) => (x ? x.value : '')),
      ]),
    ];
  }
  switch (settings.season) {
    case 'record':
      return [['Pos', 'Name', 'W', 'L', 'T', 'Points'], ...standings.map((r, i) => [posOf(r, i), r.name, r.w, r.l, r.t, fmt(r.points)])];
    case 'ryder':
      return [['Side', 'Points'], ...standings.map((r) => [r.name, fmt(r.cup)])];
    case 'cumulative':
      return [
        ['Pos', 'Name', 'Rounds', settings.scoring === 'stableford' ? 'Total points' : 'Average'],
        ...standings.map((r, i) => [posOf(r, i), r.name, r.played, settings.scoring === 'stableford' ? r.total : fmt(r.average)]),
      ];
    default:
      return [['Pos', 'Name', 'Rounds', 'Points'], ...standings.map((r, i) => [posOf(r, i), r.name, r.played, fmt(r.points)])];
  }
}
