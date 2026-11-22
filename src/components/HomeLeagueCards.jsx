import { useCallback, useEffect, useState } from 'react';
import { homeLeagueStatus, respondLeagueInvite, respondRound } from '../lib/leagueApi.js';
import { myTeeTime } from '../lib/league/pairings.js';

const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '');

// Top of the home screen: today's round (Tee off), leagues/tournaments that
// added you (Accept / Decline) and upcoming rounds you're in (I'm in /
// Can't make it). Checked when the home screen opens and when the app comes
// back to the foreground.
// fetchStatus: defaults to the database (overridable for previews).
export default function HomeLeagueCards({ userId, onTeeOff, onOpenLeague, fetchStatus = homeLeagueStatus }) {
  const [status, setStatus] = useState({ invites: [], rounds: [], today: [] });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchStatus(userId, new Date().toLocaleDateString('en-CA')).then(setStatus);
  }, [userId, fetchStatus]);

  useEffect(() => {
    load();
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  async function answer(key, fn) {
    setBusy(key);
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const { invites, rounds, today } = status;
  if (!invites.length && !rounds.length && !today.length) return null;
  return (
    <div className="home-alerts">
      {today.map((t) => {
        const tee = myTeeTime(t.event, t.memberId)?.label;
        return (
          <div key={t.event.id} className="card tee-off">
            <div className="tee-off-text">
              <span className="tee-off-tag">Today</span>
              <strong>
                {t.event.name} · {t.leagueName}
              </strong>
              <span>{[t.event.course?.name, tee].filter(Boolean).join(' · ')}</span>
            </div>
            <button className="btn tee-off-btn" onClick={() => onTeeOff(t.leagueId, t.event.id)}>
              Tee off
            </button>
          </div>
        );
      })}
      {invites.map((inv) => (
        <div key={inv.leagueId} className="card home-alert">
          <p>
            You’ve been added to the {inv.kind === 'tournament' ? 'tournament' : 'league'} <strong>{inv.name}</strong>.
          </p>
          <div className="home-alert-actions">
            <button className="btn btn-primary" disabled={busy === inv.leagueId} onClick={() => answer(inv.leagueId, () => respondLeagueInvite(inv.leagueId, true))}>
              Accept
            </button>
            <button
              className="btn btn-ghost"
              disabled={busy === inv.leagueId}
              onClick={() => {
                if (confirm(`Decline ${inv.name}? You'll be taken off it.`)) answer(inv.leagueId, () => respondLeagueInvite(inv.leagueId, false));
              }}
            >
              Decline
            </button>
            <button className="link small-link" onClick={() => onOpenLeague(inv.leagueId)}>
              View
            </button>
          </div>
        </div>
      ))}
      {rounds.map((r) => {
        const tee = myTeeTime(r.event, r.memberId)?.label;
        return (
          <div key={r.event.id} className="card home-alert">
            <p>
              You’re in <strong>{r.event.name}</strong> of {r.leagueName}
              <span className="muted"> · {[fmtDate(r.event.date), r.event.course?.name, tee].filter(Boolean).join(' · ')}</span>
            </p>
            <div className="home-alert-actions">
              <button className="btn btn-primary" disabled={busy === r.event.id} onClick={() => answer(r.event.id, () => respondRound(r.event.id, true))}>
                I’m in
              </button>
              <button className="btn btn-ghost" disabled={busy === r.event.id} onClick={() => answer(r.event.id, () => respondRound(r.event.id, false))}>
                Can’t make it
              </button>
            </div>
          </div>
        );
      })}
      {error && <p className="search-error">{error}</p>}
    </div>
  );
}
