import { orderEvents } from '../../lib/league/season.js';
import { standingsRows, toCSV } from '../../lib/league/pro.js';
import { Standings } from '../LeagueHome.jsx';
import TournamentBoard from '../TournamentBoard.jsx';

// Full standings/leaderboard with export and print.
export default function ProStandings({ data, computed, reload, openEvent }) {
  const events = orderEvents(data.events);
  const tournament = computed.settings.kind === 'tournament';

  function exportCSV() {
    const csv = toCSV(standingsRows(computed.settings, computed.standings, events));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.league.name.replace(/[^\w-]+/g, '-').toLowerCase()}-standings.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="pro-page">
      <div className="pro-page-head">
        <h2 className="pro-h">{tournament ? 'Leaderboard' : 'Standings'}</h2>
        <div className="pro-actions no-print">
          <button className="btn btn-ghost outline" onClick={exportCSV}>
            Export CSV
          </button>
          <button className="btn btn-ghost outline" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>
      <p className="print-only print-title">
        {data.league.name} · {new Date().toLocaleDateString()}
      </p>
      <div className="pro-standings">
        {tournament ? (
          <TournamentBoard computed={computed} data={data} reload={reload} onOpenEvent={openEvent} />
        ) : (
          <Standings computed={computed} events={data.events} />
        )}
      </div>
    </div>
  );
}
