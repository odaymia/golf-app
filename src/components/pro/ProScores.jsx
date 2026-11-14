import { useEffect, useRef, useState } from 'react';
import { saveScore } from '../../lib/leagueApi.js';
import { orderEvents } from '../../lib/league/season.js';
import { groupOf } from '../../lib/league/groups.js';

// Spreadsheet-style score entry for turned-in cards: type a number and it
// moves to the next hole; arrows and Tab move around. Saves as you go.
export default function ProScores({ data, computed, reload }) {
  const events = orderEvents(data.events);
  const today = new Date().toLocaleDateString('en-CA');
  const firstOpen =
    [...events].reverse().find((e) => e.status !== 'final' && (e.date ?? '') <= today) ?? events.find((e) => e.status !== 'final') ?? events.at(-1);
  const [eventId, setEventId] = useState(firstOpen?.id ?? null);
  const event = events.find((e) => e.id === eventId);

  if (!events.length) return <div className="pro-page"><h2 className="pro-h">Score entry</h2><p className="muted">Add rounds under Schedule first.</p></div>;

  return (
    <div className="pro-page">
      <div className="pro-page-head">
        <h2 className="pro-h">Score entry</h2>
        <select className="pro-select" value={eventId ?? ''} onChange={(e) => setEventId(e.target.value)}>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {e.date} {e.status === 'final' ? '(final)' : ''}
            </option>
          ))}
        </select>
      </div>
      {event && <ScoreGrid key={event.id} data={data} computed={computed} event={event} reload={reload} />}
    </div>
  );
}

function ScoreGrid({ data, computed, event, reload }) {
  const holes = event.course.holes;
  const n = holes.length;
  const result = computed.results[event.id];
  const players = data.members.filter((m) => m.active);
  const groups = event.groups ?? [];
  const [groupFilter, setGroupFilter] = useState('all');
  const [cards, setCards] = useState(() =>
    Object.fromEntries(players.map((m) => [m.id, (data.scores[event.id]?.[m.id] ?? holes.map(() => null)).slice()])),
  );
  const [status, setStatus] = useState('');
  const dirty = useRef(new Set());
  const timer = useRef(null);
  const cells = useRef({});

  const shown = groupFilter === 'all' ? players : players.filter((p) => (groups[Number(groupFilter)] ?? []).includes(p.id));

  // Save changed cards a moment after typing stops.
  useEffect(() => {
    if (!dirty.current.size) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const ids = [...dirty.current];
      dirty.current.clear();
      let sent = true;
      for (const id of ids) {
        const r = await saveScore(data.league.id, event.id, id, cards[id]);
        if (!r.sent) sent = false;
      }
      setStatus(sent ? `Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Saved on this computer; will send when online.');
      reload({ quiet: true });
    }, 900);
    return () => clearTimeout(timer.current);
  }, [cards, data.league.id, event.id, reload]);

  function setCell(id, h, raw) {
    const v = raw === '' ? null : Math.max(1, Math.min(15, Number(raw)));
    if (raw !== '' && !Number.isFinite(v)) return;
    dirty.current.add(id);
    setStatus('Saving…');
    setCards((c) => ({ ...c, [id]: c[id].map((g, i) => (i === h ? v : g)) }));
  }

  function focus(row, h) {
    const p = shown[row];
    if (!p) return;
    const el = cells.current[`${p.id}:${h}`];
    if (el) {
      el.focus();
      el.select();
    }
  }

  function onKey(e, row, h) {
    const go = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0], Enter: [1, 0] }[e.key];
    if (!go) return;
    e.preventDefault();
    let r = row + go[0];
    let c = h + go[1];
    if (c >= n) {
      c = 0;
      r += 1;
    }
    if (c < 0) {
      c = n - 1;
      r -= 1;
    }
    focus(r, c);
  }

  function onInput(e, row, h, id) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setCell(id, h, raw);
    // One digit (2-9) is a whole score: move on. A "1" might become 10+, so wait.
    if (raw.length === 2 || (raw.length === 1 && raw !== '1')) {
      if (h + 1 < n) focus(row, h + 1);
      else focus(row + 1, 0);
    }
  }

  const strokesOf = (id) => {
    const m = result.matches.find((x) => x.sides.flat().includes(id));
    return (m?.strokes?.[id] ?? result.players[id]?.strokes ?? []);
  };
  const sum = (arr, from, to) => {
    let s = 0;
    let any = false;
    for (let i = from; i < to; i++) if (arr[i] != null) (s += arr[i]), (any = true);
    return any ? s : '';
  };
  const front = Math.min(9, n);
  const parRow = holes.map((h) => h.par);
  const complete = shown.filter((p) => cards[p.id].every((g) => g != null)).length;

  return (
    <>
      <div className="pro-toolbar">
        {groups.length > 0 && (
          <select className="pro-select" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="all">Everyone ({players.length})</option>
            {groups.map((g, i) => (
              <option key={i} value={i}>
                Group {i + 1}: {g.map((id) => data.members.find((m) => m.id === id)?.name).join(', ')}
              </option>
            ))}
          </select>
        )}
        <span className="muted">
          {complete} of {shown.length} cards complete · {event.course.name} ({event.course.tee.name}) ·{' '}
          {computed.settings.net ? 'dots = handicap strokes' : 'gross'}
        </span>
        <span className="pro-save">{status}</span>
      </div>
      {event.status === 'final' && <div className="pro-alert">This round is final. As commissioner you can still correct scores.</div>}
      <div className="pro-table-wrap">
        <table className="pro-grid">
          <thead>
            <tr>
              <th className="name">Player</th>
              {holes.map((_, h) => (
                <FragmentHead key={h} h={h} />
              ))}
              <th className="tot">{n > 9 ? 'In' : 'Tot'}</th>
              {n > 9 && <th className="tot">Tot</th>}
              {computed.settings.net && <th className="tot">Net</th>}
            </tr>
            <tr className="par">
              <td className="name">Par</td>
              {holes.map((x, h) => (
                <FragmentPar key={h} h={h} par={x.par} out={sum(parRow, 0, front)} />
              ))}
              <td className="tot">{n > 9 ? sum(parRow, front, n) : sum(parRow, 0, n)}</td>
              {n > 9 && <td className="tot">{sum(parRow, 0, n)}</td>}
              {computed.settings.net && <td className="tot" />}
            </tr>
            <tr className="hcp">
              <td className="name">Hcp</td>
              {holes.map((x, h) => (
                <FragmentPar key={h} h={h} par={x.hcp} out="" />
              ))}
              <td className="tot" />
              {n > 9 && <td className="tot" />}
              {computed.settings.net && <td className="tot" />}
            </tr>
          </thead>
          <tbody>
            {shown.map((p, row) => {
              const card = cards[p.id];
              const strokes = strokesOf(p.id);
              const gross = sum(card, 0, n);
              const netTotal = gross === '' ? '' : gross - card.reduce((s, g, i) => s + (g == null ? 0 : strokes[i] ?? 0), 0);
              return (
                <tr key={p.id}>
                  <td className="name">
                    {p.name}
                    {groupOf(event, p.id).length > 1 && groups.length > 0 && (
                      <span className="muted small"> G{groups.findIndex((g) => g.includes(p.id)) + 1 || ''}</span>
                    )}
                  </td>
                  {holes.map((x, h) => {
                    const g = card[h];
                    const diff = g == null ? null : g - x.par;
                    return (
                      <FragmentCell key={h} h={h} out={sum(card, 0, front)}>
                        <input
                          ref={(el) => (cells.current[`${p.id}:${h}`] = el)}
                          className={`cell ${diff == null ? '' : diff < 0 ? 'under' : diff > 0 ? 'over' : ''}`}
                          inputMode="numeric"
                          value={g ?? ''}
                          onChange={(e) => onInput(e, row, h, p.id)}
                          onKeyDown={(e) => onKey(e, row, h)}
                          onFocus={(e) => e.target.select()}
                          aria-label={`${p.name} hole ${h + 1}`}
                        />
                        {computed.settings.net && strokes[h] > 0 && <i className="dot">{'•'.repeat(strokes[h])}</i>}
                      </FragmentCell>
                    );
                  })}
                  <td className="tot">{n > 9 ? sum(card, front, n) : gross}</td>
                  {n > 9 && <td className="tot strong">{gross}</td>}
                  {computed.settings.net && <td className="tot">{netTotal}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Type a score and it jumps to the next hole (a 1 waits in case it&apos;s a 10). Arrow keys, Tab and Enter move around.
        Scores save automatically.
      </p>
    </>
  );
}

// After hole 9 the grid shows an "Out" column (rounds are always 18 holes;
// 9-hole courses are played twice).
function FragmentHead({ h }) {
  return (
    <>
      <th>{h + 1}</th>
      {h === 8 && <th className="tot">Out</th>}
    </>
  );
}

function FragmentPar({ h, par, out }) {
  return (
    <>
      <td>{par}</td>
      {h === 8 && <td className="tot">{out}</td>}
    </>
  );
}

function FragmentCell({ h, out, children }) {
  return (
    <>
      <td className="cell-td">{children}</td>
      {h === 8 && <td className="tot">{out}</td>}
    </>
  );
}
