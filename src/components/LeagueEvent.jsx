import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteEvent, saveScore, updateEvent } from '../lib/leagueApi.js';
import { roundRobinWeek } from '../lib/league/season.js';
import { computeEvent, entityKey } from '../lib/league/event.js';
import { formatIndex } from '../lib/roundSetup.js';
import MatchCard from './MatchCard.jsx';
import { useLeagueComputed } from './useLeagueComputed.js';
import { Seg } from './controls.jsx';

const fmtToPar = (n) => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));

export default function LeagueEvent({ data, eventId, me, reload, onBack }) {
  const computed = useLeagueComputed(data);
  const event = data.events.find((e) => e.id === eventId);
  const [tab, setTab] = useState('results');
  const isAdmin = me?.role === 'commissioner';
  if (!event) return null;
  const result = computed.results[event.id];
  const { settings } = computed;
  const final = event.status === 'final';
  const canScore = !final || isAdmin;

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          ‹ League
        </button>
        <h1>{event.name}</h1>
        <span />
      </div>
      <p className="muted center">
        {event.tier === 'major' && settings.season === 'points' && <span className="major-tag">Major</span>} {event.date} ·{' '}
        {event.course.name} · {event.course.tee.name} {event.course.tee.rating}/{event.course.tee.slope}
        {final ? ' · Final' : ''}
      </p>

      <div className="tabs wide-tabs" role="tablist">
        {[
          ['results', 'Results'],
          ['score', 'Enter scores'],
          ...(isAdmin ? [['manage', 'Manage']] : []),
        ].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'results' && (
        <Results settings={settings} result={result} members={data.members} live={!final} reload={reload} />
      )}
      {tab === 'score' &&
        (canScore ? (
          <ScoreEntry
            data={data}
            event={event}
            result={result}
            indexes={computed.indexes[event.id]}
            settings={settings}
            reload={reload}
          />
        ) : (
          <p className="muted center">This round is final. Ask the commissioner to reopen it to change scores.</p>
        ))}
      {tab === 'manage' && isAdmin && (
        <Manage data={data} event={event} computed={computed} reload={reload} onDeleted={onBack} />
      )}
    </div>
  );
}

// While a round is open, pull everyone's latest scores every 20 seconds so
// the board moves live. Paused when the screen isn't visible.
function useLiveRefresh(live, reload) {
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) reload({ quiet: true });
    };
    const id = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [live, reload]);
}

function Results({ settings, result, members, live, reload }) {
  useLiveRefresh(live, reload);
  if (settings.scoring === 'match') {
    if (!result.matches.length) return <p className="muted center">No matches set yet. The commissioner sets them under Manage.</p>;
    // Ryder Cup: points won so far, plus where the matches still out on the course stand.
    const cup = settings.unit === 'ryder' ? settings.sides.map((s) => result.cup[s] ?? 0) : null;
    const leading = settings.unit === 'ryder' ? settings.sides.map(() => 0) : null;
    if (leading) {
      for (const m of result.matches) {
        if (m.result || m.status.up === 0) continue;
        const side = settings.sides.indexOf(m.keys[m.status.up > 0 ? 0 : 1]);
        if (side >= 0) leading[side]++;
      }
    }
    return (
      <>
        {cup && (
          <section className="card cup-board">
            <div>
              <span className="muted">{settings.sides[0]}</span>
              <strong className="side-a-text">{cup[0]}</strong>
            </div>
            <span className="cup-vs">Points</span>
            <div>
              <span className="muted">{settings.sides[1]}</span>
              <strong className="side-b-text">{cup[1]}</strong>
            </div>
            {(leading[0] > 0 || leading[1] > 0) && (
              <p className="cup-leading">
                Leading on the course: {settings.sides[0]} {leading[0]}, {settings.sides[1]} {leading[1]}
              </p>
            )}
          </section>
        )}
        {result.matches.map((m, i) => (
          <MatchCard key={i} names={m.names} status={m.status} results={m.results} />
        ))}
        <p className="match-legend">
          <span>
            <i className="mh a" />
            {settings.unit === 'ryder' ? settings.sides[0] : 'Left side'} won
          </span>
          <span>
            <i className="mh b" />
            {settings.unit === 'ryder' ? settings.sides[1] : 'Right side'} won
          </span>
          <span>
            <i className="mh halved" />
            Halved
          </span>
        </p>
        {live && <p className="hint center">Live: updates every 20 seconds as groups enter scores.</p>}
      </>
    );
  }
  const stableford = settings.scoring === 'stableford';
  if (!result.board.length) return <p className="muted center">No scores yet.</p>;
  return (
    <section className="card">
      <table className="standings">
        <thead>
          <tr>
            <th />
            <th className="left">{settings.unit === 'individual' ? 'Player' : 'Team'}</th>
            <th>{stableford ? 'Pts' : settings.net ? 'Net' : 'Score'}</th>
            <th>Thru</th>
            {settings.season === 'points' && <th>Season pts</th>}
          </tr>
        </thead>
        <tbody>
          {result.board.map((e, i) => (
            <tr key={e.key}>
              <td className="pos">{i > 0 && result.board[i - 1].position === e.position ? `T${e.position}` : e.position}</td>
              <td className="left">
                {e.name}
                {settings.unit !== 'individual' && (
                  <span className="muted small"> {e.ids.map((id) => members.find((m) => m.id === id)?.name).join(', ')}</span>
                )}
              </td>
              <td>{stableford ? e.value : `${fmtToPar(e.toPar)}`}</td>
              <td>{e.complete ? 'F' : e.thru}</td>
              {settings.season === 'points' && <td>{e.points ?? '–'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Season points go to finished rounds once the commissioner marks the round final.</p>
    </section>
  );
}

function ScoreEntry({ data, event, result, indexes, settings, reload }) {
  const holes = event.course.holes;
  const scored = useMemo(() => data.scores[event.id] ?? {}, [data.scores, event.id]);
  // Default group: the people in a match with you, or nobody.
  const [picked, setPicked] = useState([]);
  const [cards, setCards] = useState(() =>
    Object.fromEntries(data.members.map((m) => [m.id, (scored[m.id] ?? holes.map(() => null)).slice()])),
  );
  const [hole, setHole] = useState(1);
  const [status, setStatus] = useState('');
  const dirty = useRef(new Set());
  const timer = useRef(null);

  const flush = useMemo(
    () => async () => {
      const ids = [...dirty.current];
      dirty.current.clear();
      if (!ids.length) return;
      let allSent = true;
      for (const id of ids) {
        const r = await saveScore(data.league.id, event.id, id, cards[id]);
        if (!r.sent) allSent = false;
      }
      setStatus(allSent ? 'Saved' : 'Saved on this phone. Will send when you have signal.');
      reload({ quiet: true });
    },
    [cards, data.league.id, event.id, reload],
  );

  useEffect(() => {
    if (!dirty.current.size) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
    return () => clearTimeout(timer.current);
  }, [cards, flush]);

  // Send anything unsaved when leaving the screen.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  function setScore(id, value) {
    dirty.current.add(id);
    setStatus('');
    setCards((c) => ({ ...c, [id]: c[id].map((g, i) => (i === hole - 1 ? (value == null ? null : Math.max(1, Math.min(15, value))) : g)) }));
  }

  // Live status from the cards on this phone, before they're even sent.
  const live = useMemo(
    () =>
      computeEvent({
        settings,
        event,
        members: data.members,
        scores: { ...scored, ...Object.fromEntries(picked.map((id) => [id, cards[id]])) },
        indexes,
      }),
    [settings, event, data.members, scored, picked, cards, indexes],
  );
  const myMatches = live.matches.filter((m) => m.sides.flat().some((id) => picked.includes(id)));
  const matchFor = (id) => result.matches.find((m) => m.sides.flat().includes(id));
  const strokesFor = (id) => (matchFor(id)?.strokes?.[id] ?? result.players[id]?.strokes ?? [])[hole - 1] ?? 0;

  if (!picked.length) {
    return (
      <section className="card">
        <h3>Who are you scoring?</h3>
        <p className="hint">Pick your group. One phone can score everyone in it.</p>
        {result.matches.length > 0 && (
          <div className="stack">
            {result.matches.map((m, i) => (
              <button key={i} className="option" onClick={() => setPicked(m.sides.flat())}>
                {m.names[0]} vs {m.names[1]}
              </button>
            ))}
          </div>
        )}
        <GroupPicker members={data.members} onDone={setPicked} />
      </section>
    );
  }

  const info = holes[hole - 1];
  const people = data.members.filter((m) => picked.includes(m.id));
  return (
    <>
      <div className="hole-head">
        <button className="nav-btn" onClick={() => setHole(Math.max(1, hole - 1))} disabled={hole === 1} aria-label="Previous hole">
          ‹
        </button>
        <div className="hole-title">
          <div className="hole-num">Hole {hole}</div>
          <div className="muted">
            Par {info.par} · Hcp {info.hcp}
          </div>
        </div>
        <button className="nav-btn" onClick={() => setHole(Math.min(holes.length, hole + 1))} disabled={hole === holes.length} aria-label="Next hole">
          ›
        </button>
      </div>
      <div className="hole-dots">
        {holes.map((_, i) => (
          <button
            key={i}
            className={`dot ${people.every((p) => cards[p.id][i] != null) ? 'done' : ''} ${i === hole - 1 ? 'here' : ''}`}
            onClick={() => setHole(i + 1)}
            aria-label={`Hole ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {myMatches.map((m, i) => (
        <MatchCard key={i} names={m.names} status={m.status} compact />
      ))}
      <div className="score-rows">
        {people.map((p) => {
          const s = cards[p.id][hole - 1];
          const strokes = settings.net ? strokesFor(p.id) : 0;
          const diff = s == null ? null : s - info.par;
          return (
            <div key={p.id} className="score-row card">
              <div className="score-name">
                <strong>{p.name}</strong>
                <span className="muted">
                  {strokes > 0 ? `${'•'.repeat(strokes)} gets ${strokes}` : strokes < 0 ? `gives ${-strokes}` : ''}
                  {s != null && strokes !== 0 ? ` · net ${s - strokes}` : ''}
                </span>
              </div>
              <div className="stepper">
                <button className="step" onClick={() => setScore(p.id, s == null ? info.par - 1 : s - 1)} aria-label={`${p.name} minus one`}>
                  −
                </button>
                <button
                  className={`score-val ${diff == null ? 'empty' : diff < 0 ? 'under' : diff > 0 ? 'over' : 'par'}`}
                  onClick={() => s == null && setScore(p.id, info.par)}
                  aria-label={`${p.name} score`}
                >
                  {s ?? 'Par?'}
                </button>
                <button className="step" onClick={() => setScore(p.id, s == null ? info.par + 1 : s + 1)} aria-label={`${p.name} plus one`}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="hint center">{status || 'Scores save automatically.'}</p>
      <div className="row2">
        <button
          className="btn btn-ghost"
          onClick={async () => {
            await flush();
            setPicked([]);
          }}
        >
          Change group
        </button>
        {hole < holes.length ? (
          <button className="btn btn-primary" onClick={() => setHole(hole + 1)} disabled={!people.every((p) => cards[p.id][hole - 1] != null)}>
            Next hole
          </button>
        ) : (
          <button className="btn btn-primary" onClick={flush}>
            Save card
          </button>
        )}
      </div>
    </>
  );
}

function GroupPicker({ members, onDone }) {
  const [sel, setSel] = useState([]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <>
      <div className="chips">
        {members.map((m) => (
          <button key={m.id} className={`chip big ${sel.includes(m.id) ? 'on' : ''}`} onClick={() => toggle(m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      <button className="btn btn-primary btn-xl" disabled={!sel.length} onClick={() => onDone(sel)}>
        Score {sel.length || ''} player{sel.length === 1 ? '' : 's'}
      </button>
    </>
  );
}

function Manage({ data, event, computed, reload, onDeleted }) {
  const { settings } = computed;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sideA, setSideA] = useState([]);
  const [sideB, setSideB] = useState([]);
  const members = data.members;
  const name = (id) => members.find((m) => m.id === id)?.name ?? '?';

  async function act(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const setMatchups = (matchups) => act(() => updateEvent(event.id, { matchups }));

  function autoPair() {
    const week = data.events.filter((e) => (e.date ?? '') < (event.date ?? '') || (e.date === event.date && e.id < event.id)).length;
    let matchups;
    if (settings.unit === 'individual') {
      matchups = roundRobinWeek(members.map((m) => m.id), week).map(([a, b]) => ({ sides: [[a], [b]] }));
    } else {
      const teams = [...new Set(members.map((m) => m.team).filter(Boolean))];
      const playersOf = (t) => members.filter((m) => m.team === t).slice(0, 2).map((m) => m.id);
      matchups = roundRobinWeek(teams, week).map(([a, b]) => ({ sides: [playersOf(a), playersOf(b)] }));
    }
    setMatchups(matchups);
  }

  function addMatch() {
    if (!sideA.length || !sideB.length) return setError('Pick players for both sides.');
    if (sideA.length !== sideB.length) return setError('Both sides need the same number of players.');
    if (settings.unit !== 'individual') {
      const ka = entityKey(settings, members, sideA);
      const kb = entityKey(settings, members, sideB);
      if (ka === kb) return setError(`Both sides are on ${ka}. Pick players from different ${settings.unit === 'ryder' ? 'sides' : 'teams'}.`);
    }
    setMatchups([...event.matchups, { sides: [sideA, sideB] }]);
    setSideA([]);
    setSideB([]);
  }

  const used = new Set(event.matchups.flatMap((m) => m.sides.flat()));
  const pick = (side, setSide, other) => (
    <div className="chips">
      {members
        .filter((m) => !used.has(m.id) && !other.includes(m.id))
        .map((m) => (
          <button
            key={m.id}
            className={`chip ${side.includes(m.id) ? 'on' : ''}`}
            onClick={() => setSide(side.includes(m.id) ? side.filter((x) => x !== m.id) : side.length < 2 ? [...side, m.id] : side)}
          >
            {m.name}
            {m.team ? ` (${m.team})` : ''}
          </button>
        ))}
    </div>
  );

  return (
    <>
      {settings.scoring === 'match' && (
        <section className="card">
          <h3>Matches</h3>
          {event.matchups.length === 0 && <p className="muted">No matches yet.</p>}
          <ul className="lines">
            {event.matchups.map((mu, i) => (
              <li key={i} className="match-line">
                <span>
                  {mu.sides[0].map(name).join(' & ')} <em className="muted">vs</em> {mu.sides[1].map(name).join(' & ')}
                </span>
                <button
                  className="btn btn-ghost btn-small"
                  disabled={busy}
                  onClick={() => setMatchups(event.matchups.filter((_, j) => j !== i))}
                  aria-label="Remove match"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {settings.unit !== 'ryder' && (
            <button className="btn btn-ghost full" disabled={busy} onClick={autoPair}>
              Auto-pair (everyone plays everyone over the season)
            </button>
          )}
          <p className="hint">Side 1 (1 player for singles, 2 for best ball)</p>
          {pick(sideA, setSideA, sideB)}
          <p className="hint">Side 2</p>
          {pick(sideB, setSideB, sideA)}
          <button className="btn btn-primary full" disabled={busy} onClick={addMatch}>
            Add match
          </button>
        </section>
      )}

      {settings.season === 'points' && (
        <section className="card">
          <h3>Round type</h3>
          <Seg
            value={event.tier}
            options={[
              ['regular', 'Regular round'],
              ['major', `Major (${settings.majorMultiplier}× points)`],
            ]}
            onChange={(tier) => act(() => updateEvent(event.id, { tier }))}
          />
        </section>
      )}

      <section className="card">
        <h3>Handicaps this round</h3>
        <ul className="lines">
          {members.map((m) => (
            <li key={m.id}>
              {m.name}: index {formatIndex(computed.indexes[event.id]?.[m.id] ?? m.index ?? 0)}, plays off{' '}
              {computed.results[event.id].players[m.id].playing}
            </li>
          ))}
        </ul>
      </section>

      {error && <div className="card error-box">{error}</div>}
      <section className="card stack">
        {event.status === 'final' ? (
          <button className="btn btn-ghost btn-xl" disabled={busy} onClick={() => act(() => updateEvent(event.id, { status: 'scheduled' }))}>
            Reopen round
          </button>
        ) : (
          <button
            className="btn btn-primary btn-xl"
            disabled={busy}
            onClick={() =>
              confirm('Mark this round final? It will count in the standings and members can no longer change scores.') &&
              act(() => updateEvent(event.id, { status: 'final' }))
            }
          >
            Mark round final
          </button>
        )}
        <button
          className="btn btn-ghost full danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`Delete ${event.name} and all its scores? This cannot be undone.`)) return;
            setBusy(true);
            try {
              await deleteEvent(event.id);
              await reload();
              onDeleted();
            } catch (e) {
              setError(e.message);
              setBusy(false);
            }
          }}
        >
          Delete round
        </button>
      </section>
    </>
  );
}
