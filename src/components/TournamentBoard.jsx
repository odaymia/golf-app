import { orderEvents } from '../lib/league/season.js';
import MatchCard from './MatchCard.jsx';
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
  if (settings.unit === 'ryder') return <RyderBoard settings={settings} standings={standings} events={events} results={results} open={open} onOpenEvent={onOpenEvent} />;

  const stableford = settings.scoring === 'stableford';
  const multi = events.length > 1;
  return (
    <section className="card leaderboard">
      <div className="lb-head">
        <span className="flag dark" />
        <strong>Leaderboard</strong>
        <span className="flag dark" />
      </div>
      <div className="lb-scroll">
        <table className="lb">
          <thead>
            <tr>
              <th>Pos</th>
              <th className="left">{settings.unit === 'individual' ? 'Player' : 'Team'}</th>
              <th>{stableford ? 'Pts' : 'Total'}</th>
              {multi && <th>Today</th>}
              <th>Thru</th>
              {multi && events.map((e, i) => <th key={e.id}>R{i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {standings.map((r, i) => (
              <tr key={r.key} className={r.started ? '' : 'not-started'}>
                <td className="pos">
                  {r.position == null ? '' : i > 0 && standings[i - 1].position === r.position ? `T${r.position}` : r.position}
                </td>
                <td className="left name-cell">{r.name}</td>
                <td className={`big ${stableford ? '' : toParClass(r.toPar)}`}>
                  {!r.started ? '–' : stableford ? r.total : toParText(r.toPar)}
                </td>
                {multi && <td className={stableford ? '' : toParClass(r.today)}>{stableford ? (r.today ?? '–') : toParText(r.today)}</td>}
                <td className="muted">{r.thru ?? '–'}</td>
                {multi &&
                  r.rounds.map((round, j) => (
                    <td key={j} className="muted">
                      {!round
                ? '–'
                : round.complete
                  ? round.value
                  : `${stableford ? round.value : toParText(round.toPar)} (${round.thru})`}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        {settings.net ? 'Net scores' : 'Gross scores'}
        {stableford ? ', Stableford points.' : ', to par.'} {multi ? 'Round columns show each finished round’s score; a round in progress shows the score so far (holes played).' : ''}{' '}
        {open ? 'Live: updates every 20 seconds.' : 'Final.'}
      </p>
    </section>
  );
}

function RyderBoard({ settings, standings, events, results, open, onOpenEvent }) {
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
            <MatchCard key={i} names={m.names} status={m.status} results={m.results} />
          ))}
        </section>
      )}
      {open && <p className="hint center">Live: updates every 20 seconds as groups enter scores.</p>}
    </>
  );
}
