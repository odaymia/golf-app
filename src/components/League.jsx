import { useCallback, useEffect, useState } from 'react';
import { deleteLeague, loadLeague, updateLeague } from '../lib/leagueApi.js';
import LeagueHome from './LeagueHome.jsx';
import LeagueEvent from './LeagueEvent.jsx';
import LeagueBuilder from './LeagueBuilder.jsx';
import ProConsole from './pro/ProConsole.jsx';
import { useWide } from './pro/useWide.js';

// Loads one league and moves between its screens.
export default function League({ leagueId, user, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState({ name: 'home' });
  // Laptops and desktops get the full League Pro console; phones keep the app screens.
  const wide = useWide();

  const reload = useCallback(
    async ({ quiet = false } = {}) => {
      try {
        setData(await loadLeague(leagueId));
        setError('');
      } catch (e) {
        if (!quiet) setError(e.message);
      }
    },
    [leagueId],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  if (error && !data)
    return (
      <div className="screen">
        <div className="card warn-box">{error}</div>
        <button className="btn btn-primary btn-xl" onClick={() => reload()}>
          Try again
        </button>
        <button className="btn btn-ghost btn-xl" onClick={onBack}>
          Back
        </button>
      </div>
    );
  if (!data) return <div className="screen"><p className="muted center">Loading league…</p></div>;

  const me = data.members.find((m) => m.userId === user.id);

  if (wide)
    return (
      <ProConsole
        data={data}
        me={me}
        reload={reload}
        onBack={onBack}
        onSaveFormat={async ({ name, settings }) => {
          await updateLeague(leagueId, { name, settings });
          await reload();
        }}
        onDelete={async () => {
          await deleteLeague(leagueId);
          onBack();
        }}
      />
    );

  if (view.name === 'event')
    return (
      <LeagueEvent
        data={data}
        eventId={view.eventId}
        me={me}
        reload={reload}
        onBack={() => setView({ name: 'home' })}
      />
    );
  if (view.name === 'format')
    return (
      <LeagueBuilder
        league={data.league}
        onCancel={() => setView({ name: 'home' })}
        onSave={async ({ name, settings }) => {
          await updateLeague(leagueId, { name, settings });
          await reload();
          setView({ name: 'home' });
        }}
        onDelete={async () => {
          await deleteLeague(leagueId);
          onBack();
        }}
      />
    );
  return (
    <LeagueHome
      data={data}
      me={me}
      reload={reload}
      onOpenEvent={(eventId) => setView({ name: 'event', eventId })}
      onEditFormat={() => setView({ name: 'format' })}
      onBack={onBack}
    />
  );
}
