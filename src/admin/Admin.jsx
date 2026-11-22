import { useCallback, useEffect, useState } from 'react';
import { getSession, onAuthChange, signOut } from '../lib/account.js';
import { amIAdmin, loadAdminStats } from '../lib/adminStats.js';
import SignIn from '../components/SignIn.jsx';
import { BarChart, LineChart, Sparkline } from './charts.jsx';
import { cumulative, fillDays, fillWeeks, retentionPct, shortDate, statsCsv, stickiness, weekOf, weekOverWeek } from './metrics.js';

const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString());

// Owner dashboard: users, growth, engagement and activity. Only accounts in
// public.app_admins (supabase/admin_stats.sql) can load the numbers.
export default function Admin() {
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState({ status: 'loading' }); // loading | denied | error | ready
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getSession().then(setSession);
    return onAuthChange(setSession);
  }, []);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      if (!(await amIAdmin())) return setState({ status: 'denied' });
      setStats(await loadAdminStats());
      setState({ status: 'ready' });
    } catch (e) {
      setState({ status: 'error', message: e.message });
    }
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (session === undefined) return <p className="ad-center">Loading…</p>;
  if (!session)
    return (
      <div className="ad-signin">
        <SignIn />
      </div>
    );

  return (
    <div className="ad">
      <header className="ad-top">
        <div>
          <img src="/logo.png" alt="Scribble Golf Club" className="ad-logo" />
          <h1>Dashboard</h1>
        </div>
        <div className="ad-top-actions">
          {stats && <span className="ad-muted">Updated {new Date(stats.generated_at).toLocaleString()}</span>}
          <button className="ad-btn" onClick={load} disabled={state.status === 'loading'}>
            Refresh
          </button>
          {stats && (
            <button className="ad-btn" onClick={() => download(stats)}>
              Download CSV
            </button>
          )}
          <button className="ad-btn ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      {state.status === 'loading' && !stats && <p className="ad-center">Loading the numbers…</p>}
      {state.status === 'denied' && (
        <div className="ad-card ad-note">
          <h2>This account isn’t an owner</h2>
          <p>Add it as an owner once in the Supabase SQL Editor (see the top of supabase/admin_stats.sql), then refresh.</p>
        </div>
      )}
      {state.status === 'error' && (
        <div className="ad-card ad-note">
          <h2>Couldn’t load the numbers</h2>
          <p>{state.message}</p>
        </div>
      )}
      {stats && <Dashboard stats={stats} />}
    </div>
  );
}

function download(stats) {
  const blob = new Blob([statsCsv(stats)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `scribble-stats-${stats.today}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Tile({ label, value, sub, trend }) {
  return (
    <div className="ad-card ad-tile">
      <span className="ad-tile-label">{label}</span>
      <strong className="ad-tile-value">{value}</strong>
      <span className="ad-tile-sub">
        {trend != null && <em className={trend >= 0 ? 'up' : 'down'}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs last week</em>}
        {sub}
      </span>
    </div>
  );
}

export function Dashboard({ stats }) {
  const thisWeek = weekOf(stats.today);
  const signups = fillWeeks(stats.signups_weekly, thisWeek, 26);
  const users = cumulative(signups, stats.users_before_window ?? 0);
  const activeDaily = fillDays(stats.active_daily, stats.today, 90);
  const activeWeekly = fillWeeks(stats.active_weekly, thisWeek, 26);
  const t = stats.totals ?? {};
  const weekLabel = (p) => `Week of ${shortDate(p.x)}`;
  const activity = stats.activity_weekly ?? [];
  const series = (key) => activity.map((w) => ({ x: w.week, y: Number(w[key] ?? 0) }));
  const rows = [
    ['Casual rounds started', 'casual_rounds', t.casual_rounds],
    ['League/tournament score cards', 'league_cards', t.score_cards],
    ['Posts', 'posts', t.posts],
    ['Likes', 'likes', t.likes],
    ['Comments', 'comments', t.comments],
    ['Messages', 'messages', t.messages],
  ];
  const stick = stickiness(stats.dau, stats.mau);
  return (
    <>
      <section className="ad-tiles">
        <Tile label="Total users" value={fmt(stats.users)} sub={`+${fmt(stats.users_7d)} this week · +${fmt(stats.users_30d)} in 30 days`} />
        <Tile label="Daily active" value={fmt(stats.dau)} sub="opened the app today" />
        <Tile label="Weekly active" value={fmt(stats.wau)} trend={weekOverWeek(activeWeekly)} sub="" />
        <Tile label="Monthly active" value={fmt(stats.mau)} sub={stick == null ? '' : `${stick}% open it daily (DAU/MAU)`} />
        <Tile label="Leagues & tournaments" value={fmt((t.leagues ?? 0) + (t.tournaments ?? 0))} sub={`${fmt(t.leagues)} leagues · ${fmt(t.tournaments)} tournaments`} />
        <Tile label="Rounds played" value={fmt((t.league_rounds_scored ?? 0) + (t.casual_rounds ?? 0))} sub={`${fmt(t.league_rounds_scored)} league/tournament · ${fmt(t.casual_rounds)} casual`} />
      </section>

      <section className="ad-grid2">
        <div className="ad-card">
          <h2>Total users</h2>
          <p className="ad-muted">Accounts at the end of each week, last 26 weeks</p>
          <LineChart points={users} label="Total users by week" format={weekLabel} />
        </div>
        <div className="ad-card">
          <h2>New users per week</h2>
          <p className="ad-muted">Sign-ups, last 26 weeks</p>
          <BarChart points={signups} label="New users per week" format={weekLabel} />
        </div>
        <div className="ad-card">
          <h2>Daily active users</h2>
          <p className="ad-muted">People who opened the app each day, last 90 days{stats.tracking_since ? ` · tracked since ${shortDate(stats.tracking_since)}` : ''}</p>
          <LineChart points={activeDaily} label="Daily active users" format={(p) => shortDate(p.x)} />
        </div>
        <div className="ad-card">
          <h2>Weekly active users</h2>
          <p className="ad-muted">People who opened the app at least once that week</p>
          <BarChart points={activeWeekly} label="Weekly active users" format={weekLabel} />
        </div>
      </section>

      <section className="ad-card">
        <h2>Retention</h2>
        <p className="ad-muted">Of the people who joined each week, the share who opened the app again in each week after</p>
        <Retention cohorts={stats.retention ?? []} />
      </section>

      <section className="ad-grid2">
        <div className="ad-card">
          <h2>Activity</h2>
          <p className="ad-muted">Last 26 weeks</p>
          <table className="ad-table">
            <thead>
              <tr>
                <th>What</th>
                <th>Trend</th>
                <th className="num">This week</th>
                <th className="num">All time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, key, total]) => {
                const s = series(key);
                return (
                  <tr key={key}>
                    <td>{name}</td>
                    <td>
                      <Sparkline points={s} />
                    </td>
                    <td className="num">{fmt(s.at(-1)?.y ?? 0)}</td>
                    <td className="num">{fmt(total)}</td>
                  </tr>
                );
              })}
              <tr>
                <td>Players in leagues/tournaments</td>
                <td />
                <td className="num" />
                <td className="num">{fmt(t.players_in_leagues)}</td>
              </tr>
              <tr>
                <td>Follows</td>
                <td />
                <td className="num" />
                <td className="num">{fmt(t.follows)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="ad-card">
          <h2>Most active players</h2>
          <p className="ad-muted">Days they opened the app, last 30 days</p>
          <table className="ad-table">
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">Days</th>
                <th className="num">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {(stats.top_users ?? []).map((u, i) => (
                <tr key={i}>
                  <td>{u.name}</td>
                  <td className="num">{u.days}</td>
                  <td className="num">{shortDate(u.last)}</td>
                </tr>
              ))}
              {!stats.top_users?.length && (
                <tr>
                  <td colSpan={3} className="ad-muted">
                    Visits are counted from now on.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <h2 className="ad-sub">Top courses</h2>
          <table className="ad-table">
            <tbody>
              {(stats.top_courses ?? []).map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="num">
                    {c.rounds} round{c.rounds === 1 ? '' : 's'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Retention({ cohorts }) {
  if (!cohorts.length) return <p className="ad-muted">No sign-ups in the last 12 weeks yet.</p>;
  return (
    <div className="ad-scroll">
      <table className="ad-table ad-ret">
        <thead>
          <tr>
            <th>Joined week of</th>
            <th className="num">People</th>
            {Array.from({ length: 8 }, (_, k) => (
              <th key={k} className="num">
                Wk {k + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.week}>
              <td>{shortDate(c.week)}</td>
              <td className="num">{c.size}</td>
              {Array.from({ length: 8 }, (_, k) => {
                const pct = retentionPct(c, k);
                return (
                  <td key={k} className="num ad-heat" style={pct == null ? undefined : { '--heat': pct / 100, color: pct >= 55 ? '#fff' : undefined }} title={pct == null ? 'Not reached yet' : `${c.back[k]} of ${c.size}`}>
                    {pct == null ? '' : `${pct}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
