import { orderEvents } from '../lib/league/season.js';
import { MATCH_FORMATS } from '../lib/league/event.js';
import { useState } from 'react';
import MatchCard from './MatchCard.jsx';
import Leaderboard from './Leaderboard.jsx';
import { MatchDetail } from './ScoreTable.jsx';
import { useLiveRefresh } from './useLiveRefresh.js';

const toParText = (n) => (n == null ? '–' : n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);
const toParClass = (n) => (n == null ? '' : n < 0 ? 'red' : n === 0 ? 'even' : '');
const pts = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '').replace('.5', '½'));

// Live tournament leaderboard (stroke play / Stableford) or Ryder Cup board.
export default function TournamentBoard({ computed, data, reload, onOpenEvent }) {
  const { settings, standings, results } = computed;
  const events = orderEvents(data.events);
  const open = events.some((e) => e.status !== 'final');
  useLiveRefresh(open, reload);

  if (!events.length) {
    return <p className="muted center">Add the first round under Rounds, and the leaderboard starts here.</p>;
  }
  if (settings.unit === 'ryder')
    return (
      <RyderBoard
        settings={settings}
        standings={standings}
        events={events}
        results={results}
        members={data.members}
        open={open}
        onOpenEvent={onOpenEvent}
      />
    );

  const stableford = settings.scoring === 'stableford';
  const multi = events.length > 1;
  // Scorecards show the latest round anyone has scored.
  const latest = [...events].reverse().find((e) => Object.values(results[e.id]?.players ?? {}).some((p) => p.thru > 0)) ?? events[0];
  const rows = standings.map((r, i) => ({
    key: r.key,
    pos: r.position == null ? '' : standings.some((o, j) => j !== i && o.position === r.position) ? `T${r.position}` : String(r.position),
    name: r.name,
    ids: settings.unit === 'individual' ? [r.key] : data.members.filter((m) => m.team === r.key).map((m) => m.id),
    value: !r.started ? '–' : stableford ? r.total : toParText(r.toPar),
    valueClass: stableford ? '' : toParClass(r.toPar) === 'red' ? 'under' : '',
    thru: r.thru ?? '–',
    r,
  }));
  return (
    <>
      <Leaderboard
        rows={rows}
        valueLabel={stableford ? 'Pts' : settings.net ? 'Net' : 'Total'}
        nameLabel={settings.unit === 'individual' ? 'Player' : 'Team'}
        round={{ holes: latest.course.holes, course: latest.course, players: results[latest.id]?.players ?? {} }}
        members={data.members}
        settings={settings}
        extraHead={
          multi ? (
            <>
              <th>Today</th>
              {events.map((e, i) => (
                <th key={e.id}>R{i + 1}</th>
              ))}
            </>
          ) : null
        }
        extraCell={({ r }) => (
          <>
            <td className={stableford ? '' : toParClass(r.today)}>{stableford ? (r.today ?? '–') : toParText(r.today)}</td>
            {r.rounds.map((round, j) => (
              <td key={j} className="muted">
                {!round ? '–' : round.complete ? round.value : `${stableford ? round.value : toParText(round.toPar)} (${round.thru})`}
              </td>
            ))}
          </>
        )}
      />
      <p className="hint center">
        {settings.net ? 'Net scores' : 'Gross scores'}
        {stableford ? ', Stableford points.' : ', to par.'} {multi ? `Scorecards show ${latest.name}.` : ''}{' '}
        {open ? 'Live: updates every 20 seconds.' : 'Final.'}
      </p>
    </>
  );
}

const roundFormats = (matches) => [...new Set(matches.map((m) => MATCH_FORMATS[m.format].short))].join(' + ');

function RyderBoard({ settings, standings, events, results, members, open, onOpenEvent }) {
  const [card, setCard] = useState(null); // open match (index in the live round)
  const bySide = Object.fromEntries(standings.map((r) => [r.key, r]));
  const [a, b] = settings.sides.map((s) => bySide[s]);
  const live = [...events].reverse().find((e) => results[e.id]?.matches.some((m) => !m.result && m.status.played > 0));
  return (
    <>
      <section className="card cup-board">
        <div>
          <span className="muted">{settings.sides[0]}</span>
          <strong className="side-a-text">{pts(a.total)}</strong>
        </div>
        <span className="cup-vs">Total points</span>
        <div>
          <span className="muted">{settings.sides[1]}</span>
          <strong className="side-b-text">{pts(b.total)}</strong>
        </div>
        {open && (a.projected !== a.total || b.projected !== b.total) && (
          <p className="cup-leading">
            Projected with matches on the course: {settings.sides[0]} {pts(a.projected)}, {settings.sides[1]}{' '}
            {pts(b.projected)}
          </p>
        )}
      </section>

      <section className="card">
        <h3>By round</h3>
        <table className="standings">
          <thead>
            <tr>
              <th className="left">Round</th>
              <th>{settings.sides[0]}</th>
              <th>{settings.sides[1]}</th>
              <th>Matches</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => {
              const ms = results[e.id]?.matches ?? [];
              return (
                <tr key={e.id} className="clickable" onClick={() => onOpenEvent(e.id)}>
                  <td className="left">
                    {e.name || `Round ${i + 1}`}
                    {e.status === 'final' ? '' : <span className="badge"> · live</span>}
                    {ms[0] && <span className="round-format">{roundFormats(ms)}</span>}
                  </td>
                  <td className="side-a-text">{pts(a.rounds[i])}</td>
                  <td className="side-b-text">{pts(b.rounds[i])}</td>
                  <td className="muted">
                    {ms.filter((m) => m.result).length}/{ms.length}
                  </td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td className="left">Total</td>
              <td className="side-a-text">{pts(a.total)}</td>
              <td className="side-b-text">{pts(b.total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </section>

      {live && (
        <section>
          <p className="section-title">On the course · {live.name}</p>
          {results[live.id].matches.map((m, i) => (
            <div key={i} className="match-open">
              <MatchCard
                names={m.names}
                status={m.status}
                results={m.results}
                label={MATCH_FORMATS[m.format].label}
                onOpen={() => setCard(card === i ? null : i)}
              />
              {card === i && (
                <MatchDetail
                  match={m}
                  sideNames={settings.sides}
                  holes={live.course.holes}
                  grossOf={(id) => results[live.id].players[id]?.gross ?? []}
                  nameOf={(id) => members.find((x) => x.id === id)?.name ?? '?'}
                  net={settings.net}
                />
              )}
            </div>
          ))}
        </section>
      )}
      {open && <p className="hint center">Live: updates every 20 seconds as groups enter scores.</p>}
    </>
  );
}
