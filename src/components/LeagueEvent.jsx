import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteEvent, saveScore, updateEvent } from '../lib/leagueApi.js';
import { roundRobinWeek } from '../lib/league/season.js';
import { computeEvent, entityKey, MATCH_FORMATS, matchFormat } from '../lib/league/event.js';
import { formatIndex } from '../lib/roundSetup.js';
import MatchCard from './MatchCard.jsx';
import { useLiveRefresh } from './useLiveRefresh.js';
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
          ‹ {settings.kind === 'tournament' ? 'Tournament' : 'League'}
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
          <MatchCard
            key={i}
            names={m.names}
            status={m.status}
            results={m.results}
            label={settings.unit === 'individual' ? null : MATCH_FORMATS[m.format].label}
          />
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
      {settings.season === 'points' && (
        <p className="hint">Season points go to finished rounds once the commissioner marks the round final.</p>
      )}
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

  // One score for a row. A team row (scramble, foursomes) writes the team's
  // score onto every partner's card.
  function setScore(row, value) {
    const v = value == null ? null : Math.max(1, Math.min(15, value));
    row.ids.forEach((id) => dirty.current.add(id));
    setStatus('');
    setCards((c) => {
      const next = { ...c };
      for (const id of row.ids) next[id] = c[id].map((g, i) => (i === hole - 1 ? v : g));
      return next;
    });
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
                {m.sides[0].length > 1 && <span className="option-help">{MATCH_FORMATS[m.format].label}</span>}
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
  // Rows to score: one per player, or one per team in one-ball formats.
  const rows = [];
  const seen = new Set();
  for (const p of people) {
    if (seen.has(p.id)) continue;
    const m = matchFor(p.id);
    const side = m?.teamBall ? m.sides.find((sd) => sd.includes(p.id)) : null;
    const ids = side ?? [p.id];
    ids.forEach((id) => seen.add(id));
    rows.push({
      key: ids.join('+'),
      ids,
      team: !!side,
      name: ids.map((id) => data.members.find((x) => x.id === id)?.name).join(' & '),
      format: m?.teamBall ? MATCH_FORMATS[m.format].short : null,
    });
  }
  const rowScore = (row, i) => cards[row.ids[0]][i];
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
            className={`dot ${rows.every((r) => rowScore(r, i) != null) ? 'done' : ''} ${i === hole - 1 ? 'here' : ''}`}
            onClick={() => setHole(i + 1)}
            aria-label={`Hole ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {myMatches.map((m, i) => (
        <MatchCard key={i} names={m.names} status={m.status} label={MATCH_FORMATS[m.format].short} compact />
      ))}
      <div className="score-rows">
        {rows.map((row) => {
          const s = rowScore(row, hole - 1);
          const strokes = settings.net ? strokesFor(row.ids[0]) : 0;
          const diff = s == null ? null : s - info.par;
          return (
            <div key={row.key} className="score-row card">
              <div className="score-name">
                <strong>{row.name}</strong>
                <span className="muted">
                  {row.team ? `${row.format} team score` : ''}
                  {row.team && strokes !== 0 ? ' · ' : ''}
                  {strokes > 0 ? `${'•'.repeat(strokes)} gets ${strokes}` : strokes < 0 ? `gives ${-strokes}` : ''}
                  {s != null && strokes !== 0 ? ` · net ${s - strokes}` : ''}
                </span>
              </div>
              <div className="stepper">
                <button className="step" onClick={() => setScore(row, s == null ? info.par - 1 : s - 1)} aria-label={`${row.name} minus one`}>
                  −
                </button>
                <button
                  className={`score-val ${diff == null ? 'empty' : diff < 0 ? 'under' : diff > 0 ? 'over' : 'par'}`}
                  onClick={() => s == null && setScore(row, info.par)}
                  aria-label={`${row.name} score`}
                >
                  {s ?? 'Par?'}
                </button>
                <button className="step" onClick={() => setScore(row, s == null ? info.par + 1 : s + 1)} aria-label={`${row.name} plus one`}>
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
          <button className="btn btn-primary" onClick={() => setHole(hole + 1)} disabled={!rows.every((r) => rowScore(r, hole - 1) != null)}>
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

const FORMAT_HELP = {
  fourball: 'Everyone plays their own ball; the better score on each hole counts.',
  shamble: 'Pick the best drive, then everyone plays their own ball in; both scores are added.',
  scramble: 'Everyone hits, the team picks the best shot every time; one team score per hole.',
  foursomes: 'Partners take turns hitting one ball; one team score per hole.',
  singles: 'One player against one player.',
};

function Manage({ data, event, computed, reload, onDeleted }) {
  const { settings } = computed;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sideA, setSideA] = useState([]);
  const [sideB, setSideB] = useState([]);
  const members = data.members;
  // Team formats: the commissioner picks one format for the round.
  const usesFormats = settings.unit !== 'individual';
  const [roundFormat, setRoundFormat] = useState(() =>
    event.matchups[0] ? matchFormat(event.matchups[0]) : usesFormats ? 'fourball' : 'singles',
  );
  const size = MATCH_FORMATS[roundFormat].size;

  function changeFormat(f) {
    const need = MATCH_FORMATS[f].size;
    if (event.matchups.some((mu) => mu.sides[0].length !== need)) {
      return setError(
        need === 1
          ? 'These matches have two players a side. Remove them to switch this round to singles.'
          : 'These are singles matches. Remove them to switch this round to a team format.',
      );
    }
    setError('');
    setRoundFormat(f);
    setSideA([]);
    setSideB([]);
    if (event.matchups.length) setMatchups(event.matchups.map((mu) => ({ ...mu, format: f })));
  }
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
      const playersOf = (t) => members.filter((m) => m.team === t).slice(0, size).map((m) => m.id);
      matchups = roundRobinWeek(teams, week).map(([a, b]) => ({ sides: [playersOf(a), playersOf(b)], format: roundFormat }));
    }
    setMatchups(matchups);
  }

  function addMatch() {
    if (sideA.length !== size || sideB.length !== size)
      return setError(size === 1 ? 'Pick one player for each side.' : 'Pick two players for each side.');
    if (settings.unit !== 'individual') {
      const word = settings.unit === 'ryder' ? 'side' : 'team';
      const noTeam = [...sideA, ...sideB].map((id) => members.find((m) => m.id === id)).filter((m) => !m?.team);
      if (noTeam.length) return setError(`Give ${noTeam.map((m) => m.name).join(' and ')} a ${word} under Players first.`);
      const ka = entityKey(settings, members, sideA);
      const kb = entityKey(settings, members, sideB);
      if (ka === kb) return setError(`Both sides are on ${ka}. Pick players from different ${settings.unit === 'ryder' ? 'sides' : 'teams'}.`);
    }
    setMatchups([...event.matchups, { sides: [sideA, sideB], format: roundFormat }]);
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
            onClick={() => setSide(side.includes(m.id) ? side.filter((x) => x !== m.id) : side.length < size ? [...side, m.id] : side)}
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
          {usesFormats && (
            <>
              <h3>Format for this round</h3>
              <div className="stack format-pick">
                {Object.entries(MATCH_FORMATS).map(([k, f]) => (
                  <button key={k} className={`option ${roundFormat === k ? 'on' : ''}`} onClick={() => changeFormat(k)} disabled={busy}>
                    {f.label}
                    <span className="option-help">{FORMAT_HELP[k]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <h3>Matches</h3>
          {event.matchups.length === 0 && <p className="muted">No matches yet.</p>}
          <ul className="lines">
            {event.matchups.map((mu, i) => (
              <li key={i} className="match-line">
                <span>
                  {mu.sides[0].map(name).join(' & ')} <em className="muted">vs</em> {mu.sides[1].map(name).join(' & ')}
                  {usesFormats && <span className="muted small"> · {MATCH_FORMATS[matchFormat(mu)].short}</span>}
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
          <p className="hint">Side 1 ({size === 1 ? 'one player' : 'two players'})</p>
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
