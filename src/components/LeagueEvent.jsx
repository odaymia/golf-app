import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteEvent, saveScore, updateEvent } from '../lib/leagueApi.js';
import { roundRobinWeek } from '../lib/league/season.js';
import { computeEvent, entityKey, holeStableford, MATCH_FORMATS, matchFormat } from '../lib/league/event.js';
import { formatIndex } from '../lib/roundSetup.js';
import MatchCard from './MatchCard.jsx';
import MatchScorecard from './MatchScorecard.jsx';
import { useLiveRefresh } from './useLiveRefresh.js';
import { useLeagueComputed } from './useLeagueComputed.js';
import { Seg } from './controls.jsx';
import { canScore, groupOf } from '../lib/league/groups.js';
import PairingsEditor, { MyTeeTime, TeeSheet } from './PairingsEditor.jsx';
import { SideGamesBoard, SideGamesEditor } from './SideGames.jsx';
import RyderLive from './RyderLive.jsx';
import Leaderboard from './Leaderboard.jsx';
import { discrepancies, discrepancyHoles } from '../lib/league/ryder.js';

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
      <MyTeeTime event={event} members={data.members} meId={me?.id} />

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
        <Results
          settings={settings}
          result={result}
          members={data.members}
          holes={event.course.holes}
          live={!final}
          reload={reload}
          standings={computed.standings}
          event={event}
        />
      )}
      {tab === 'results' && <ScoreChecks data={data} event={event} />}
      {tab === 'results' && (
        <SideGamesBoard
          event={event}
          members={data.members}
          scores={data.scores[event.id] ?? {}}
          indexes={computed.indexes[event.id] ?? {}}
          handicap={settings.handicap}
          meId={me?.id}
        />
      )}
      {tab === 'results' && <TeeSheet event={event} members={data.members} meId={me?.id} />}
      {tab === 'score' &&
        (canScore ? (
          <ScoreEntry
            data={data}
            event={event}
            me={me}
            result={result}
            indexes={computed.indexes[event.id]}
            settings={settings}
            reload={reload}
            computedStandings={computed.standings}
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

function Results({ settings, result, members, holes, live, reload, standings = [], event }) {
  useLiveRefresh(live, reload);
  const [open, setOpen] = useState(null);
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
    if (settings.unit === 'ryder')
      return (
        <>
          <RyderLive sides={settings.sides} standings={standings} result={result} onOpenMatch={setOpen} members={members} title={event?.name} />
          {open != null && result.matches[open] && (
            <MatchScorecard
              match={result.matches[open]}
              holes={holes}
              grossOf={(id) => result.players[id]?.gross ?? holes.map(() => null)}
              nameOf={(id) => members.find((m) => m.id === id)?.name ?? '?'}
              net={settings.net}
              label={MATCH_FORMATS[result.matches[open].format].label}
              sideNames={settings.sides}
              onClose={() => setOpen(null)}
            />
          )}
          <p className="hint center">Tap a match for its scorecard.{live ? ' Live: updates every 20 seconds as groups enter scores.' : ''}</p>
        </>
      );
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
            onOpen={() => setOpen(i)}
          />
        ))}
        {open != null && result.matches[open] && (
          <MatchScorecard
            match={result.matches[open]}
            holes={holes}
            grossOf={(id) => result.players[id]?.gross ?? holes.map(() => null)}
            nameOf={(id) => members.find((m) => m.id === id)?.name ?? '?'}
            net={settings.net}
            label={settings.unit === 'individual' ? null : MATCH_FORMATS[result.matches[open].format].label}
            sideNames={settings.unit === 'ryder' ? settings.sides : null}
            onClose={() => setOpen(null)}
          />
        )}
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
  const posText = (e, i) => (result.board.some((o, j) => j !== i && o.position === e.position) ? `T${e.position}` : String(e.position));
  const rows = result.board.map((e, i) => ({
    key: e.key,
    pos: posText(e, i),
    name: e.name,
    ids: e.ids,
    value: stableford ? e.value : fmtToPar(e.toPar),
    valueClass: !stableford && e.toPar < 0 ? 'under' : '',
    thru: e.complete ? 'F' : e.thru,
    points: e.points,
  }));
  const seasonPts = settings.season === 'points';
  return (
    <>
      <Leaderboard
        rows={rows}
        valueLabel={stableford ? 'Pts' : settings.net ? 'Net' : 'Score'}
        nameLabel={settings.unit === 'individual' ? 'Player' : 'Team'}
        round={{ holes, course: event.course, players: result.players }}
        members={members}
        settings={settings}
        extraHead={seasonPts ? <th>Season pts</th> : null}
        extraCell={(r) => <td key="sp">{r.points ?? '–'}</td>}
      />
      {seasonPts && <p className="hint">Season points go to finished rounds once the commissioner marks the round final.</p>}
    </>
  );
}

function ScoreEntry({ data, event, me, result, indexes, settings, reload, computedStandings = [] }) {
  const holes = event.course.holes;
  const scored = useMemo(() => data.scores[event.id] ?? {}, [data.scores, event.id]);
  // Open straight on my foursome's card (players and a playing commissioner).
  // Not in a group yet: show the picker.
  const [picked, setPicked] = useState(() => {
    if (!me) return [];
    const mine = groupOf(event, me.id);
    return mine.length > 1 ? mine : [];
  });
  const myUserId = me?.userId ?? null;
  const entries = useMemo(() => data.entries?.[event.id] ?? [], [data.entries, event.id]);
  // Each scorekeeper keeps their own card. It starts from what I entered
  // before; holes I haven't entered show the official score to confirm.
  const [cards, setCards] = useState(() =>
    Object.fromEntries(
      data.members.map((m) => {
        const mine = entries.find((e) => e.memberId === m.id && e.scorerId === myUserId);
        return [m.id, holes.map((_, i) => mine?.gross?.[i] ?? null)];
      }),
    ),
  );
  // The official card with my numbers on top (never wipes holes I left blank).
  const merged = (id) => holes.map((_, i) => cards[id]?.[i] ?? scored[id]?.[i] ?? null);
  // Start on the first hole my group hasn't finished.
  const [hole, setHole] = useState(() => {
    if (!picked.length) return 1;
    const i = holes.findIndex((_, h) => picked.some((id) => scored[id]?.[h] == null));
    return i < 0 ? holes.length : i + 1;
  });
  const [status, setStatus] = useState('');
  const [review, setReview] = useState(false); // end-of-round scorecard
  const [pad, setPad] = useState(null); // { row } while the score picker is open
  const [submitted, setSubmitted] = useState(false);
  const dirty = useRef(new Set());
  const timer = useRef(null);

  const flush = useMemo(
    () => async () => {
      const ids = [...dirty.current];
      dirty.current.clear();
      if (!ids.length) return;
      let allSent = true;
      for (const id of ids) {
        const r = await saveScore(data.league.id, event.id, id, merged(id), cards[id]);
        if (!r.sent) allSent = false;
      }
      setStatus(allSent ? 'Saved' : 'Saved on this phone. Will send when you have signal.');
      reload({ quiet: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- merged reads cards + scored
    [cards, scored, data.league.id, event.id, reload],
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
    if (!row.ids.every((id) => canScore(event, me, id))) return;
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
        scores: { ...scored, ...Object.fromEntries(picked.map((id) => [id, merged(id)])) },
        indexes,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- merged reads cards + scored
    [settings, event, data.members, scored, picked, cards, indexes],
  );
  // Scorekeepers who disagree, using my latest numbers for my own card.
  const disc = useMemo(
    () =>
      discrepancies([
        ...entries.filter((e) => e.scorerId !== myUserId),
        ...Object.entries(cards)
          .filter(([, g]) => g.some((x) => x != null))
          .map(([memberId, gross]) => ({ memberId, scorerId: myUserId ?? 'me', gross })),
      ]),
    [entries, cards, myUserId],
  );
  const scorerName = (uid) => (uid === myUserId ? 'You' : data.members.find((m) => m.userId === uid)?.name ?? 'Someone');
  const myMatches = live.matches.filter((m) => m.sides.flat().some((id) => picked.includes(id)));
  const matchFor = (id) => result.matches.find((m) => m.sides.flat().includes(id));
  const strokesFor = (id) => (matchFor(id)?.strokes?.[id] ?? result.players[id]?.strokes ?? [])[hole - 1] ?? 0;

  const isAdmin = me?.role === 'commissioner';
  if (!picked.length) {
    if (!me) return <p className="muted center">Only players in this event can enter scores.</p>;
    const nameOf = (id) => data.members.find((m) => m.id === id)?.name ?? '?';
    if (!isAdmin) {
      // Players score their own group only.
      const mine = groupOf(event, me.id);
      return (
        <section className="card">
          <h3>Your group</h3>
          <p className="big-names">{mine.map(nameOf).join(', ')}</p>
          <button className="btn btn-primary btn-xl" onClick={() => setPicked(mine)}>
            Score my group
          </button>
          <p className="hint">
            {mine.length === 1
              ? "The commissioner hasn't put you in a group yet, so you can enter your own score."
              : 'One phone can score the whole group. You can view every other group under Results.'}
          </p>
        </section>
      );
    }
    const groups = event.groups ?? [];
    return (
      <section className="card">
        <h3>Who are you scoring?</h3>
        <p className="hint">As commissioner you can score any group.</p>
        {(groups.length > 0 || result.matches.length > 0) && (
          <div className="stack">
            {groups.map((g, i) => (
              <button key={`g${i}`} className="option" onClick={() => setPicked(g)}>
                Group {i + 1}
                <span className="option-help">{g.map(nameOf).join(', ')}</span>
              </button>
            ))}
            {result.matches.map((m, i) => (
              <button key={i} className="option" onClick={() => setPicked(m.sides.flat())}>
                {m.names[0]} vs {m.names[1]}
                {m.sides[0].length > 1 && <span className="option-help">{MATCH_FORMATS[m.format].label}</span>}
              </button>
            ))}
          </div>
        )}
        <GroupPicker members={data.members.filter((m) => m.active)} onDone={setPicked} />
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
  const rowScore = (row, i) => cards[row.ids[0]][i] ?? scored[row.ids[0]]?.[i] ?? null;
  const myScore = (row, i) => cards[row.ids[0]][i];
  const badHoles = discrepancyHoles(disc, people.map((p) => p.id));
  const stablefordGame = settings.scoring === 'stableford';
  // This hole's points (or net score) and the running total for a row.
  const rowTotals = (row) => {
    const id = row.ids[0];
    const card = holes.map((_, i) => rowScore(row, i));
    const st = matchFor(id)?.strokes?.[id] ?? result.players[id]?.strokes ?? holes.map(() => 0);
    const here = card[hole - 1];
    if (stablefordGame) {
      const ptsOf = (i) => holeStableford(settings, card[i], settings.net ? st[i] ?? 0 : 0, holes[i].par);
      const total = card.reduce((t, g, i) => t + (g == null ? 0 : ptsOf(i)), 0);
      return { hole: here == null ? null : ptsOf(hole - 1), total, unit: 'Pts', cls: 'pts' };
    }
    let toPar = 0;
    let played = 0;
    card.forEach((g, i) => {
      if (g == null) return;
      played++;
      toPar += (settings.net ? g - (st[i] ?? 0) : g) - holes[i].par;
    });
    return {
      hole: settings.net && here != null ? here - (st[hole - 1] ?? 0) : null,
      total: played ? (toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : String(toPar)) : '–',
      unit: '',
      cls: toPar < 0 ? 'under' : '',
    };
  };
  if (review) {
    return (
      <RoundReview
        holes={holes}
        rows={rows}
        cardOf={(row) => holes.map((_, i) => rowScore(row, i))}
        strokesOf={(row) => (matchFor(row.ids[0])?.strokes?.[row.ids[0]] ?? result.players[row.ids[0]]?.strokes ?? [])}
        net={settings.net}
        badHoles={badHoles}
        matches={myMatches}
        submitted={submitted}
        onHole={(h) => {
          setReview(false);
          setHole(h);
        }}
        onBack={() => setReview(false)}
        onSubmit={async () => {
          await flush();
          setSubmitted(true);
        }}
      />
    );
  }

  return (
    <>
      {settings.unit === 'ryder' && (
        <RyderLive sides={settings.sides} standings={computedStandings} result={live} myIds={picked} />
      )}
      {badHoles.length > 0 && (
        <button className="card disc-banner" onClick={() => setHole(badHoles[0] + 1)}>
          ⚠ Scores don’t match on hole{badHoles.length === 1 ? '' : 's'} {badHoles.map((h) => h + 1).join(', ')}. Tap to check.
        </button>
      )}
      <div className="gg-holebar">
        <button className="gg-nav" onClick={() => setHole(Math.max(1, hole - 1))} disabled={hole === 1} aria-label="Previous hole">
          {hole > 1 ? `‹ Hole ${hole - 1}` : ''}
        </button>
        <div className="gg-hole">
          <strong>Hole {hole}</strong>
          <span>
            Par {info.par} · Hcp {info.hcp} · {event.course.tee.name} tees
          </span>
        </div>
        <button className="gg-nav right" onClick={() => setHole(Math.min(holes.length, hole + 1))} disabled={hole === holes.length} aria-label="Next hole">
          {hole < holes.length ? `Hole ${hole + 1} ›` : ''}
        </button>
      </div>
      <div className="hole-dots slim">
        {holes.map((_, i) => (
          <button
            key={i}
            className={`dot ${rows.every((r) => rowScore(r, i) != null) ? 'done' : ''} ${i === hole - 1 ? 'here' : ''} ${badHoles.includes(i) ? 'disc' : ''}`}
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
      <div className="gg-table">
        <div className="gg-head">
          <span>Player</span>
          <span>Score</span>
          <span>{stablefordGame ? 'Pts' : settings.net ? 'Net' : ''}</span>
          <span>Total</span>
        </div>
        {rows.map((row, ri) => {
          const id = row.ids[0];
          const s = rowScore(row, hole - 1);
          const mineHere = myScore(row, hole - 1);
          const toConfirm = mineHere == null && s != null; // someone else entered it
          const conflict = disc[id]?.[hole - 1];
          const strokes = settings.net ? strokesFor(id) : 0;
          const diff = s == null ? null : s - info.par;
          const t = rowTotals(row);
          return (
            <div key={row.key} className={`gg-row ${conflict ? 'conflict' : ''}`}>
              <div className="gg-name">
                <strong>
                  {row.name}
                  {!row.team && result.players[id] && <span className="gg-hcp"> ({result.players[id].playing})</span>}
                </strong>
                {row.team && <em>{row.format} team score</em>}
              </div>
              <button
                className={`gg-score ${diff == null ? 'empty' : diff < 0 ? 'under' : diff > 0 ? 'over' : 'par'} ${toConfirm ? 'unconfirmed' : ''}`}
                onClick={() => setPad({ row: ri })}
                aria-label={toConfirm ? `${row.name} score ${s}, tap to confirm or change` : `${row.name} score`}
              >
                {s ?? '–'}
                {strokes > 0 && <i className="gg-dots">{'•'.repeat(strokes)}</i>}
              </button>
              <span className="gg-pts">{t.hole ?? ''}</span>
              <span className={`gg-total ${t.cls}`}>
                {t.total}
                {t.unit && <small>{t.unit}</small>}
              </span>
              {conflict && (
                <div className="conflict-note">
                  <span>
                    ⚠ Scores don’t match: {conflict.map((c) => `${scorerName(c.scorerId)} ${c.value}`).join(' · ')}
                  </span>
                  <span className="conflict-fix">
                    {[...new Set(conflict.map((c) => c.value))].map((v) => (
                      <button key={v} className="btn btn-small outline btn-ghost" onClick={() => setScore(row, v)}>
                        Use {v}
                      </button>
                    ))}
                  </span>
                </div>
              )}
              {toConfirm && !conflict && <p className="confirm-note">Entered by another scorekeeper. Tap it to agree or change.</p>}
            </div>
          );
        })}
      </div>
      {pad && rows[pad.row] && (
        <ScorePad
          name={rows[pad.row].name}
          hole={hole}
          par={info.par}
          value={rowScore(rows[pad.row], hole - 1)}
          onPick={(v, keepOpen) => {
            setScore(rows[pad.row], v);
            // A number enters the score and closes the pad (11+ stays open to count up).
            if (!keepOpen) setPad(null);
          }}
          onClose={() => setPad(null)}
        />
      )}
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
        <button className="btn btn-ghost" onClick={() => setReview(true)}>
          Card
        </button>
        {hole < holes.length ? (
          <button className="btn btn-primary" onClick={() => setHole(hole + 1)} disabled={!rows.every((r) => rowScore(r, hole - 1) != null)}>
            Next hole
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={async () => {
              await flush();
              setReview(true);
            }}
            disabled={!rows.every((r) => rowScore(r, hole - 1) != null)}
          >
            Review round
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
  shamble: 'Pick the best drive, then everyone plays their own ball in. Both balls are added together for the team score.',
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
  // Only players with a Scribble account can be paired, grouped or scored.
  const playable = members.filter((m) => m.active);
  const waiting = members.length - playable.length;
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
      matchups = roundRobinWeek(playable.map((m) => m.id), week).map(([a, b]) => ({ sides: [[a], [b]] }));
    } else {
      const teams = [...new Set(playable.map((m) => m.team).filter(Boolean))];
      const playersOf = (t) => playable.filter((m) => m.team === t).slice(0, size).map((m) => m.id);
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
      {playable
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

      <RoundDetails event={event} busy={busy} onSave={(patch) => act(() => updateEvent(event.id, patch))} />

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

      {waiting > 0 && (
        <p className="hint center">
          {waiting} invited player{waiting === 1 ? ' hasn’t' : 's haven’t'} joined yet, so they can&apos;t be paired or scored.
        </p>
      )}
      <PairingsEditor
        data={data}
        event={event}
        computed={computed}
        playable={playable}
        roundFormat={roundFormat}
        busy={busy}
        setError={setError}
        onSave={(patch) => act(() => updateEvent(event.id, patch))}
      />

      <SideGamesEditor
        key={event.id}
        event={event}
        members={members}
        busy={busy}
        onSave={(sideGames) => act(() => updateEvent(event.id, { sideGames }))}
      />

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

function RoundDetails({ event, busy, onSave }) {
  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(event.date ?? '');
  const changed = name.trim() !== event.name || (date || null) !== (event.date || null);
  return (
    <section className="card">
      <h3>Round details</h3>
      <div className="row2">
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {changed && (
        <button className="btn btn-primary full" disabled={busy || !name.trim()} onClick={() => onSave({ name: name.trim(), date })}>
          Save details
        </button>
      )}
    </section>
  );
}

// Holes where two scorekeepers entered different scores, for everyone to see.
function ScoreChecks({ data, event }) {
  const disc = discrepancies(data.entries?.[event.id] ?? []);
  const items = Object.entries(disc).flatMap(([memberId, holes]) =>
    Object.entries(holes).map(([h, vals]) => ({ memberId, hole: Number(h) + 1, vals })),
  );
  if (!items.length) return null;
  const name = (id) => data.members.find((m) => m.id === id)?.name ?? '?';
  const scorer = (uid) => data.members.find((m) => m.userId === uid)?.name ?? 'Someone';
  return (
    <section className="card disc-list">
      <h3>⚠ Scores to check</h3>
      <ul className="lines">
        {items.map((d) => (
          <li key={`${d.memberId}-${d.hole}`}>
            <strong>{name(d.memberId)}</strong>, hole {d.hole}: {d.vals.map((v) => `${scorer(v.scorerId)} has ${v.value}`).join(' · ')}
          </li>
        ))}
      </ul>
      <p className="hint">The scorekeepers fix it by entering the same score. Until then the latest one counts.</p>
    </section>
  );
}

// End of round: the whole group's card to check before submitting. Tap a
// score to go back to that hole and fix it.
function RoundReview({ holes, rows, cardOf, strokesOf, net, badHoles, matches, submitted, onHole, onBack, onSubmit }) {
  const n = holes.length;
  const front = Math.min(9, n);
  const sum = (arr, a, b) => {
    let t = 0;
    let any = false;
    for (let i = a; i < b; i++) if (arr[i] != null) (t += arr[i]), (any = true);
    return any ? t : '';
  };
  const par = holes.map((h) => h.par);
  const missing = rows.some((r) => cardOf(r).some((g) => g == null));
  const cellClass = (g, p) => (g == null ? 'empty' : g <= p - 2 ? 'eagle' : g === p - 1 ? 'birdie' : g === p + 1 ? 'bogey' : g >= p + 2 ? 'double' : '');
  const half = (from, to, label) => (
    <table className="review-card">
      <thead>
        <tr>
          <th className="rc-name">Hole</th>
          {holes.slice(from, to).map((_, i) => (
            <th key={i} className={badHoles.includes(from + i) ? 'disc' : ''}>
              {from + i + 1}
            </th>
          ))}
          <th className="rc-tot">{label}</th>
        </tr>
        <tr className="rc-par">
          <td className="rc-name">Par</td>
          {par.slice(from, to).map((p, i) => (
            <td key={i}>{p}</td>
          ))}
          <td className="rc-tot">{sum(par, from, to)}</td>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const card = cardOf(r);
          return (
            <tr key={r.key}>
              <td className="rc-name">{r.name}</td>
              {card.slice(from, to).map((g, i) => (
                <td key={i} className={badHoles.includes(from + i) ? 'disc' : ''}>
                  <button className={`rc-score ${cellClass(g, par[from + i])}`} onClick={() => onHole(from + i + 1)} aria-label={`${r.name} hole ${from + i + 1}`}>
                    {g ?? '–'}
                  </button>
                </td>
              ))}
              <td className="rc-tot">{sum(card, from, to)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return (
    <section className="card round-review">
      <h3>Your group’s scorecard</h3>
      <p className="hint">Check every score. Tap one to go back to that hole and fix it.</p>
      <div className="review-scroll">{half(0, front, n > 9 ? 'Out' : 'Tot')}</div>
      {n > 9 && <div className="review-scroll">{half(front, n, 'In')}</div>}
      <ul className="lines review-totals">
        {rows.map((r) => {
          const card = cardOf(r);
          const gross = sum(card, 0, n);
          const strokes = strokesOf(r);
          const netTotal = gross === '' ? '' : gross - card.reduce((t, g, i) => t + (g == null ? 0 : strokes[i] ?? 0), 0);
          const toPar = gross === '' ? null : gross - sum(par.filter((_, i) => card[i] != null), 0, n || 0);
          return (
            <li key={r.key}>
              <strong>{r.name}</strong>
              <span>
                {gross === '' ? '–' : gross}
                {toPar != null && <em> ({toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar})</em>}
                {net && netTotal !== '' && <span className="muted"> · net {netTotal}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {matches.map((m, i) => (
        <MatchCard key={i} names={m.names} status={m.status} label={MATCH_FORMATS[m.format].short} compact />
      ))}
      {badHoles.length > 0 && <p className="search-error">Scores don’t match on hole{badHoles.length === 1 ? '' : 's'} {badHoles.map((h) => h + 1).join(', ')}. Fix them before submitting.</p>}
      {missing && <p className="hint">Some holes are still blank.</p>}
      {submitted ? (
        <p className="share-status">Scores submitted ✓ They’re on the leaderboard.</p>
      ) : (
        <button className="btn btn-primary btn-xl" disabled={badHoles.length > 0} onClick={onSubmit}>
          Submit scores
        </button>
      )}
      <button className="btn btn-ghost full" onClick={onBack}>
        ‹ Back to scoring
      </button>
    </section>
  );
}

// Number picker for one player's score on a hole (opens from the score box).
function ScorePad({ name, hole, par, value, onPick, onClose }) {
  const nums = Array.from({ length: 10 }, (_, i) => i + 1);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet score-pad" role="dialog" aria-modal="true" aria-label={`Score for ${name}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>
            {name} <span className="muted">· Hole {hole}</span>
          </h2>
          <button className="btn btn-ghost" onClick={onClose}>
            {value > 10 ? 'Done' : 'Cancel'}
          </button>
        </div>
        <div className="pad-grid">
          {nums.map((n) => (
            <button
              key={n}
              className={`pad-key ${n === value ? 'on' : ''} ${n === par ? 'par' : n < par ? 'under' : 'over'}`}
              onClick={() => onPick(n)}
            >
              {n}
              <small>{n === par ? 'Par' : n === par - 1 ? 'Birdie' : n === par - 2 ? 'Eagle' : n === par + 1 ? 'Bogey' : n === par + 2 ? 'Double' : ''}</small>
            </button>
          ))}
          <button className="pad-key more" onClick={() => onPick(Math.min(15, Math.max(11, (value ?? 10) + 1)), true)}>
            {value > 10 ? value + 1 : '11+'}
          </button>
        </div>
      </div>
    </div>
  );
}
