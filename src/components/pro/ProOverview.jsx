import { orderEvents } from '../../lib/league/season.js';
import { Standings } from '../LeagueHome.jsx';
import TournamentBoard from '../TournamentBoard.jsx';

const fmtDate = (d) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date';

// The commissioner's home: the numbers, what needs doing, and the top of the table.
export default function ProOverview({ data, computed, isAdmin, go, openEvent }) {
  const { members } = data;
  const events = orderEvents(data.events);
  const today = new Date().toLocaleDateString('en-CA');
  const active = members.filter((m) => m.active);
  const invited = members.filter((m) => !m.active && m.inviteEmail);
  const noAccount = members.filter((m) => !m.active && !m.inviteEmail);
  const finals = events.filter((e) => e.status === 'final');
  const next = events.find((e) => e.status !== 'final' && (e.date ?? '') >= today) ?? events.find((e) => e.status !== 'final');
  const teamFormat = computed.settings.unit !== 'individual';
  const matchFormat = computed.settings.scoring === 'match';

  // Things a commissioner should look at, most urgent first.
  const todo = [];
  if (isAdmin) {
    if (active.length < 2) todo.push({ text: 'Add players: invite them by email or import your roster.', to: 'players' });
    if (!events.length) todo.push({ text: 'Build your schedule: create the season’s rounds in one go.', to: 'schedule' });
    for (const e of events.filter((x) => x.status !== 'final' && (x.date ?? '') < today)) {
      const scored = Object.keys(data.scores[e.id] ?? {}).length;
      todo.push({ text: `${e.name} (${fmtDate(e.date)}) has ${scored} card${scored === 1 ? '' : 's'} in. Enter the rest and mark it final.`, event: e.id });
    }
    if (next && matchFormat && !next.matchups.length) todo.push({ text: `Set the matches for ${next.name}.`, event: next.id });
    if (next && !(next.groups ?? []).length && !next.matchups.length) todo.push({ text: `Set the groups for ${next.name} so players can score their own group.`, event: next.id });
    if (teamFormat && active.some((m) => !m.team)) todo.push({ text: `${active.filter((m) => !m.team).length} player(s) need a team.`, to: 'players' });
    if (active.some((m) => m.index == null)) todo.push({ text: `${active.filter((m) => m.index == null).length} player(s) have no handicap index.`, to: 'players' });
    if (invited.length) todo.push({ text: `${invited.length} invited player(s) haven’t joined yet. Send them the invite link.`, to: 'players' });
    if (noAccount.length) todo.push({ text: `${noAccount.length} player(s) need an email invite to get a Scribble account.`, to: 'players' });
  }

  return (
    <div className="pro-page">
      <h2 className="pro-h">Overview</h2>
      <div className="pro-stats">
        <div className="pro-stat">
          <span>Players</span>
          <strong>{active.length}</strong>
          <em>{invited.length + noAccount.length ? `${invited.length + noAccount.length} waiting to join` : 'all joined'}</em>
        </div>
        <div className="pro-stat">
          <span>Rounds</span>
          <strong>
            {finals.length}
            <small> / {Math.max(events.length, computed.settings.kind === 'tournament' ? computed.settings.rounds : 0)}</small>
          </strong>
          <em>final</em>
        </div>
        <div className="pro-stat clickable" onClick={() => next && openEvent(next.id)}>
          <span>Next round</span>
          <strong className="pro-stat-text">{next ? next.name : '–'}</strong>
          <em>{next ? `${fmtDate(next.date)} · ${next.course.name}` : 'Nothing scheduled'}</em>
        </div>
      </div>

      {isAdmin && (
        <section className="pro-card">
          <h3>To do</h3>
          {todo.length === 0 ? (
            <p className="muted">All caught up.</p>
          ) : (
            <ul className="pro-todo">
              {todo.map((t, i) => (
                <li key={i}>
                  <span>{t.text}</span>
                  <button className="btn btn-ghost btn-small" onClick={() => (t.event ? openEvent(t.event) : go(t.to))}>
                    {t.event ? 'Open round' : 'Go'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="pro-card">
        <div className="pro-card-head">
          <h3>{computed.settings.kind === 'tournament' ? 'Leaderboard' : 'Standings'}</h3>
          <button className="btn btn-ghost btn-small" onClick={() => go('standings')}>
            Full standings ›
          </button>
        </div>
        {computed.settings.kind === 'tournament' ? (
          <TournamentBoard computed={computed} data={data} reload={() => {}} onOpenEvent={openEvent} />
        ) : (
          <Standings computed={{ ...computed, standings: computed.standings.slice(0, 8) }} events={data.events} />
        )}
      </section>
    </div>
  );
}
