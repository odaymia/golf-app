import { useCallback, useEffect, useState } from 'react';
import { deleteLeague, loadLeague, updateLeague } from '../lib/leagueApi.js';
import LeagueHome from './LeagueHome.jsx';
import LeagueEvent from './LeagueEvent.jsx';
import LeagueBuilder from './LeagueBuilder.jsx';
import ProConsole from './pro/ProConsole.jsx';
import { useWide } from './pro/useWide.js';

// Loads one league and moves between its screens.
// start: { eventId, tab } to open straight onto a round (e.g. reopening the
// app mid-round). onPlace(place | null): where to come back to next time.
export default function League({ leagueId, user, onBack, start = null, onPlace = () => {} }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState(() => (start?.eventId ? { name: 'event', eventId: start.eventId, tab: start.tab ?? 'results' } : { name: 'home' }));
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
  }, [view.name, view.eventId]);

  // Scoring a round: remember it so reopening the app comes straight back.
  const placeKey = view.name === 'event' && view.tab === 'score' ? view.eventId : null;
  useEffect(() => {
    onPlace(placeKey ? { eventId: placeKey, tab: 'score' } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPlace is a fresh closure each render
  }, [placeKey]);

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

  // A remembered round that no longer exists: show the league instead.
  if (view.name === 'event' && !data.events.some((e) => e.id === view.eventId)) {
    setView({ name: 'home' });
    return null;
  }
  if (view.name === 'event')
    return (
      <LeagueEvent
        key={view.eventId}
        data={data}
        eventId={view.eventId}
        me={me}
        reload={reload}
        initialTab={view.tab}
        onTab={(tab) => setView((v) => ({ ...v, tab }))}
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
      onOpenEvent={(eventId, tab = 'results') => setView({ name: 'event', eventId, tab })}
      onEditFormat={() => setView({ name: 'format' })}
      onBack={onBack}
    />
  );
}
