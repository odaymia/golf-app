import { useState } from 'react';
import RyderSetup from '../RyderSetup.jsx';
import { describeLeague } from '../../lib/league/format.js';
import { inviteLink } from '../../lib/leagueApi.js';
import { useLeagueComputed } from '../useLeagueComputed.js';
import LeagueEvent from '../LeagueEvent.jsx';
import LeagueBuilder from '../LeagueBuilder.jsx';
import ProOverview from './ProOverview.jsx';
import ProPlayers from './ProPlayers.jsx';
import ProSchedule from './ProSchedule.jsx';
import ProScores from './ProScores.jsx';
import ProStandings from './ProStandings.jsx';

const SECTIONS = [
  ['overview', 'Overview'],
  ['players', 'Players'],
  ['schedule', 'Schedule'],
  ['scores', 'Score entry'],
  ['standings', 'Standings'],
];

// Desktop League Pro console: everything a commissioner runs, on a big screen.
export default function ProConsole({ data, me, reload, onBack, onSaveFormat, onDelete }) {
  const computed = useLeagueComputed(data);
  const isAdmin = me?.role === 'commissioner';
  const ryder = computed.settings.unit === 'ryder';
  const needsSetup = ryder && (data.events.length === 0 || data.events.some((e) => !e.matchups.length));
  const [section, setSection] = useState(isAdmin && needsSetup ? 'ryder' : 'overview');
  const [eventId, setEventId] = useState(null);
  const [copied, setCopied] = useState(false);
  const { league } = data;
  const tournament = computed.settings.kind === 'tournament';
  const go = (s) => {
    setEventId(null);
    setSection(s);
    window.scrollTo(0, 0);
  };
  const openEvent = (id) => {
    setEventId(id);
    window.scrollTo(0, 0);
  };

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink(league.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked; the link is shown anyway
    }
  }

  const base = isAdmin && ryder ? [['ryder', 'Ryder Cup setup'], ...SECTIONS] : SECTIONS;
  const sections = isAdmin ? [...base, ['format', 'Format & settings']] : base.filter(([k]) => !['scores'].includes(k));

  return (
    <div className="pro-layout">
      <aside className="pro-side">
        <button className="pro-back" onClick={onBack}>
          ‹ All events
        </button>
        <div className="pro-title">
          <span className="pro-kind">{tournament ? 'Tournament' : 'League'}</span>
          <h1>{league.name}</h1>
          <p>{describeLeague(computed.settings)}</p>
        </div>
        <nav className="pro-nav">
          {sections.map(([k, label]) => (
            <button key={k} className={section === k && !eventId ? 'on' : ''} onClick={() => go(k)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="pro-invite">
          <span>Invite code</span>
          <strong>{league.code}</strong>
          <button onClick={copyLink}>{copied ? 'Link copied ✓' : 'Copy invite link'}</button>
        </div>
        {data.offline && <p className="pro-note">Offline: showing the last copy.</p>}
      </aside>

      <main className="pro-main">
        {eventId ? (
          <div className="pro-event">
            <LeagueEvent data={data} eventId={eventId} me={me} reload={reload} onBack={() => setEventId(null)} />
          </div>
        ) : section === 'ryder' ? (
          <div className="pro-page">
            <h2 className="pro-h">Ryder Cup setup</h2>
            <RyderSetup data={data} computed={computed} me={me} reload={reload} onOpenEvent={openEvent} />
          </div>
        ) : section === 'overview' ? (
          <ProOverview data={data} computed={computed} isAdmin={isAdmin} go={go} openEvent={openEvent} />
        ) : section === 'players' ? (
          <ProPlayers data={data} computed={computed} me={me} isAdmin={isAdmin} reload={reload} />
        ) : section === 'schedule' ? (
          <ProSchedule data={data} computed={computed} isAdmin={isAdmin} reload={reload} openEvent={openEvent} />
        ) : section === 'scores' ? (
          <ProScores data={data} computed={computed} reload={reload} />
        ) : section === 'standings' ? (
          <ProStandings data={data} computed={computed} reload={reload} openEvent={openEvent} />
        ) : section === 'format' && isAdmin ? (
          <div className="pro-format">
            <LeagueBuilder league={league} onCancel={() => go('overview')} onSave={onSaveFormat} onDelete={onDelete} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
