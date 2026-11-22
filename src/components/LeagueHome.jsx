import { useState } from 'react';
import RyderSetup from './RyderSetup.jsx';
import CoursePicker from './CoursePicker.jsx';
import AddMembers from './AddMembers.jsx';
import { myTeeTime } from '../lib/league/pairings.js';
import { roundToPlay } from '../lib/league/groups.js';
import { describeLeague } from '../lib/league/format.js';
import { useLeagueComputed } from './useLeagueComputed.js';
import { addMember, createEvent, inviteLink, removeMember, setMemberRole, updateMember } from '../lib/leagueApi.js';
import { looksLikeEmail } from '../lib/account.js';
import { saveCourse } from '../lib/storage.js';
import { courseProblems, formatIndex, parseIndex } from '../lib/roundSetup.js';
import { Seg } from './controls.jsx';
import TournamentBoard from './TournamentBoard.jsx';
import { PayoutsBoard, SavedPayoutsEditor } from './Payouts.jsx';

const fmtPts = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));
const fmtDate = (d) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';

export default function LeagueHome({ data, me, reload, onOpenEvent, onEditFormat, onBack }) {
  const computed = useLeagueComputed(data);
  const isAdmin = me?.role === 'commissioner';
  const { league, members, events } = data;
  // Ryder Cup: the commissioner sets it up step by step (teams, rounds, matches).
  const ryderSetup = isAdmin && computed.settings.unit === 'ryder';
  const [tab, setTab] = useState(() =>
    ryderSetup && (events.length === 0 || events.some((e) => !e.matchups.length)) ? 'setup' : 'standings',
  );

  // Tap Play to go straight to your foursome's scorecard.
  const today = new Date().toLocaleDateString('en-CA');
  const playRound = roundToPlay(events, me?.id, today);
  const playTee = playRound ? (myTeeTime(playRound, me?.id)?.label ?? null) : null;

  async function share() {
    const text = `Join "${league.name}" on Scribble Golf Club: ${inviteLink(league.code)} (or enter code ${league.code} in the app)`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        alert('Invite copied');
      }
    } catch {
      // share sheet dismissed
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          ‹ Home
        </button>
        <h1>{league.name}</h1>
        {isAdmin ? (
          <button className="btn btn-ghost" onClick={onEditFormat}>
            Format
          </button>
        ) : (
          <span />
        )}
      </div>
      <p className="muted center">{describeLeague(computed.settings)}</p>
      {data.offline && <div className="card warn-box">No connection: showing the last copy on this phone.</div>}
      {data.pending > 0 && (
        <div className="card warn-box">{data.pending} score card(s) saved on this phone, waiting for signal to send.</div>
      )}

      {playRound && (
        <button className="card play-now" onClick={() => onOpenEvent(playRound.id, 'score')}>
          <span className="play-now-icon" aria-hidden="true">
            ▶
          </span>
          <span className="play-now-text">
            <strong>Play {playRound.name}</strong>
            <span>
              {[playRound.date === today ? 'Today' : fmtDate(playRound.date), playRound.course?.name, playTee].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="play-now-go" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      <div className="card invite">
        <div>
          <span className="muted">Invite code</span>
          <strong className="code">{league.code}</strong>
        </div>
        <button className="btn btn-primary" onClick={share}>
          Invite
        </button>
      </div>

      <div className="tabs wide-tabs" role="tablist">
        {[
          ...(ryderSetup ? [['setup', 'Set up']] : []),
          ['standings', computed.settings.kind === 'tournament' ? 'Leaderboard' : 'Standings'],
          ['rounds', 'Rounds'],
          ['members', computed.settings.kind === 'tournament' ? 'Players' : 'Members'],
        ].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'setup' && ryderSetup && (
        <RyderSetup data={data} computed={computed} me={me} reload={reload} onOpenEvent={onOpenEvent} />
      )}
      {tab === 'standings' &&
        (computed.settings.kind === 'tournament' ? (
          <TournamentBoard computed={computed} data={data} reload={reload} onOpenEvent={onOpenEvent} isAdmin={isAdmin} meId={me?.id} />
        ) : (
          <>
            {computed.settings.scoring !== 'match' && isAdmin && (
              <SavedPayoutsEditor title="Season payouts" data={data} settings={computed.settings} entrants={computed.standings.length} reload={reload} />
            )}
            {computed.settings.scoring !== 'match' && (
              <PayoutsBoard
                title="Season payouts"
                config={computed.settings.payouts}
                rows={computed.standings.map((r) => ({ key: r.key, name: r.name, position: (r.played ?? 1) > 0 ? r.position : null }))}
                final={false}
                people={computed.settings.unit === 'individual'}
                meKey={me?.id}
              />
            )}
            <Standings computed={computed} events={events} />
          </>
        ))}
      {tab === 'rounds' && (
        <Rounds data={data} computed={computed} isAdmin={isAdmin} meId={me?.id} reload={reload} onOpenEvent={onOpenEvent} />
      )}
      {tab === 'members' && <Members data={data} computed={computed} me={me} isAdmin={isAdmin} reload={reload} />}
      {members.length < 2 && tab !== 'members' && tab !== 'setup' && (
        <p className="hint center">
          Invite players with the code above, or add them under {computed.settings.kind === 'tournament' ? 'Players' : 'Members'}.
        </p>
      )}
    </div>
  );
}

export function Standings({ computed, events }) {
  const { settings, standings } = computed;
  const finals = events.filter((e) => e.status === 'final').length;
  if (!standings.length) return <p className="muted center">No players yet.</p>;
  const cols =
    settings.season === 'ryder'
      ? [['cup', 'Points']]
      : settings.season === 'record'
        ? [
            ['w', 'W'],
            ['l', 'L'],
            ['t', 'T'],
            ['points', 'Pts'],
          ]
        : settings.season === 'cumulative'
          ? settings.scoring === 'stableford'
            ? [
                ['played', 'Rds'],
                ['total', 'Pts'],
              ]
            : [
                ['played', 'Rds'],
                ['average', 'Avg'],
              ]
          : [
              ['played', 'Rds'],
              ['points', 'Pts'],
            ];
  return (
    <section className="card">
      <table className="standings">
        <thead>
          <tr>
            <th />
            <th className="left">{settings.unit === 'individual' ? 'Player' : settings.unit === 'ryder' ? 'Side' : 'Team'}</th>
            {cols.map(([, label]) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standings.map((r, i) => (
            <tr key={r.key}>
              <td className="pos">{standings.some((o, j) => j !== i && o.position === r.position) ? `T${r.position}` : r.position}</td>
              <td className="left">{r.name}</td>
              {cols.map(([k]) => (
                <td key={k}>{r[k] == null ? '–' : typeof r[k] === 'number' ? fmtPts(r[k]) : r[k]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        {finals === 0 ? 'Standings fill in as rounds are marked final.' : `After ${finals} final round${finals > 1 ? 's' : ''}.`}
        {settings.bestOf ? ` Best ${settings.bestOf} weeks count.` : ''}
      </p>
    </section>
  );
}

function Rounds({ data, computed, isAdmin, meId, reload, onOpenEvent }) {
  const [adding, setAdding] = useState(false);
  const { events } = data;
  return (
    <>
      {events.length === 0 && <p className="muted center">No rounds scheduled yet.</p>}
      <ul className="round-list">
        {events.map((ev) => {
          const r = computed.results[ev.id];
          const leader =
            r.board[0]?.name ??
            (r.matches.length ? `${r.matches.filter((m) => m.result).length}/${r.matches.length} matches done` : null);
          const tee = ev.status !== 'final' && meId ? myTeeTime(ev, meId) : null;
          return (
            <li key={ev.id} className="card round-item">
              <button className="round-open" onClick={() => onOpenEvent(ev.id)}>
                <strong>
                  {ev.name}
                  {computed.settings.kind === 'tournament' && (
                    <span className="muted small"> of {Math.max(computed.settings.rounds, events.length)}</span>
                  )}
                  {ev.tier === 'major' && computed.settings.season === 'points' && <span className="major-tag">Major</span>}
                </strong>
                <span className="muted">
                  {fmtDate(ev.date)} · {ev.course.name}
                  {ev.course.tee?.name ? ` (${ev.course.tee.name})` : ''}
                </span>
                {tee?.label && <span className="round-tee">Your tee time: {tee.label}</span>}
                <span className={`badge ${ev.status === 'final' ? 'final' : ''}`}>
                  {ev.status === 'final' ? 'Final' : 'Open'}
                  {leader && r.board.length ? ` · leader ${leader}` : leader ? ` · ${leader}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {isAdmin &&
        (adding ? (
          <AddRound
            leagueId={data.league.id}
            usesTiers={computed.settings.season === 'points'}
            count={events.length}
            label={computed.settings.kind === 'tournament' ? 'Round' : 'Week'}
            onDone={async (ev) => {
              setAdding(false);
              await reload();
              if (ev) onOpenEvent(ev.id);
            }}
          />
        ) : (
          <button className="btn btn-primary btn-xl" onClick={() => setAdding(true)}>
            + Add round
          </button>
        ))}
    </>
  );
}

function AddRound({ leagueId, usesTiers, count, label, onDone }) {
  const [name, setName] = useState(`${label} ${count + 1}`);
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA')); // local YYYY-MM-DD
  const [pick, setPick] = useState({ course: null, teeIdx: 0, notes: [] });
  const [tier, setTier] = useState('regular');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const { course, teeIdx } = pick;
    if (!course) return setError('Pick a course: search for it, or type its name and add it as a new course.');
    const raw = course.tees[teeIdx] ?? course.tees[0];
    const tee = { ...raw, rating: Number(raw.rating), slope: Number(raw.slope) };
    const problems = courseProblems(course, tee);
    if (problems.length) return setError(`${problems[0]} Fix it in a casual round's course editor first.`);
    setBusy(true);
    setError('');
    try {
      await saveCourse({ ...course, tees: course.tees.map((t) => ({ ...t, rating: Number(t.rating), slope: Number(t.slope) })) }).catch(() => {});
      const ev = await createEvent(leagueId, {
        name: name.trim() || `${label} ${count + 1}`,
        date,
        tier: usesTiers ? tier : 'regular',
        course: { name: course.name, holes: course.holes, tee: { name: tee.name, rating: tee.rating, slope: tee.slope } },
      });
      onDone(ev);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Add a round</h2>
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
      {usesTiers && (
        <Seg
          value={tier}
          options={[
            ['regular', 'Regular round'],
            ['major', 'Major'],
          ]}
          onChange={setTier}
        />
      )}
      <CoursePicker
        course={pick.course}
        teeIdx={pick.teeIdx}
        notes={pick.notes}
        onChange={(next) => {
          setPick(next);
          setError('');
        }}
      />
      {error && <p className="search-error">{error}</p>}
      <div className="row2">
        <button className="btn btn-ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Add round'}
        </button>
      </div>
    </section>
  );
}

const blankMember = { id: null, name: '', email: '', indexText: '', ghinNumber: '', team: '' };

function Members({ data, computed, me, isAdmin, reload }) {
  const { members } = data;
  const { settings } = computed;
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const usesTeams = settings.unit !== 'individual';
  const teamNames = settings.unit === 'ryder' ? settings.sides : [...new Set(members.map((m) => m.team).filter(Boolean))];
  const lastEvent = data.events[data.events.length - 1];
  const leagueIdx = lastEvent ? computed.indexes[lastEvent.id] : null;

  async function save() {
    if (!editing.name.trim()) return setError('Enter a name.');
    const index = parseIndex(editing.indexText);
    if (index === null) return setError('Index should be a number like 12.4, or +2.1.');
    // Everyone plays with a Scribble account: players without one are invited by email.
    const needsEmail = !editing.userId;
    if (needsEmail && !looksLikeEmail(editing.email ?? '')) return setError('Enter their email so they can join with a Scribble account.');
    setBusy(true);
    setError('');
    try {
      const m = { ...editing, index: editing.indexText.trim() === '' ? null : index };
      if (!needsEmail) delete m.email;
      if (editing.id) await updateMember(editing.id, m);
      else await addMember(data.league.id, m);
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const groups = usesTeams
    ? [...teamNames.map((t) => [t, members.filter((m) => m.team === t)]), ['No team yet', members.filter((m) => !m.team || !teamNames.includes(m.team))]]
    : [['', members]];

  return (
    <>
      {groups
        .filter(([, list]) => list.length || usesTeams)
        .map(([title, list]) => (
          <section key={title || 'all'} className="card">
            {title && (
              <h3>
                {title} <span className="muted">({list.length})</span>
              </h3>
            )}
            {list.length === 0 && <p className="muted">Nobody yet.</p>}
            <ul className="saved-players">
              {list.map((m) => (
                <li key={m.id}>
                  <button
                    className="saved-player"
                    disabled={!isAdmin}
                    onClick={() =>
                      setEditing({
                        ...m,
                        email: m.inviteEmail ?? '',
                        indexText: m.index == null ? '' : formatIndex(m.index),
                        team: m.team ?? '',
                      })
                    }
                  >
                    <strong>
                      {m.name}
                      {m.id === me?.id ? ' (you)' : ''}
                      {m.role === 'commissioner' ? ' · commissioner' : ''}
                    </strong>
                    <span className="muted">
                      {m.index == null ? 'No index' : `Index ${formatIndex(m.index)}`}
                      {settings.handicap.mode === 'league' && leagueIdx?.[m.id] != null && leagueIdx[m.id] !== m.index
                        ? ` · league ${formatIndex(leagueIdx[m.id])}`
                        : ''}
                      {m.userId ? (m.pending ? ' · waiting to accept' : '') : m.inviteEmail ? ' · invited, waiting to join' : ' · needs an account'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

      {isAdmin &&
        (editing ? (
          <section className="card player-editor">
            <h3>{editing.id ? `Edit ${editing.name}` : 'Invite a player'}</h3>
            {!editing.userId && (
              <p className="hint">
                Every player needs a Scribble account. When they sign in with this email (or open your invite link), this
                spot becomes theirs. Until then they can&apos;t be grouped or scored.
              </p>
            )}
            <label className="field">
              <span>Name</span>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            {!editing.userId && (
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  autoCapitalize="none"
                  value={editing.email ?? ''}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  placeholder="player@example.com"
                />
              </label>
            )}
            <div className="row2">
              <label className="field">
                <span>Index</span>
                <input
                  inputMode="decimal"
                  value={editing.indexText}
                  onChange={(e) => setEditing({ ...editing, indexText: e.target.value })}
                />
              </label>
              <label className="field">
                <span>GHIN number</span>
                <input
                  inputMode="numeric"
                  value={editing.ghinNumber}
                  placeholder="Optional"
                  onChange={(e) => setEditing({ ...editing, ghinNumber: e.target.value.replace(/\D/g, '') })}
                />
              </label>
            </div>
            {usesTeams && (
              <>
                <p className="hint">{settings.unit === 'ryder' ? 'Side' : 'Team'}</p>
                {settings.unit === 'ryder' ? (
                  <Seg
                    value={editing.team}
                    options={settings.sides.map((x) => [x, x])}
                    onChange={(team) => setEditing({ ...editing, team })}
                  />
                ) : (
                  <>
                    <input
                      list="team-names"
                      value={editing.team}
                      placeholder="Team name, e.g. Eagles"
                      onChange={(e) => setEditing({ ...editing, team: e.target.value })}
                    />
                    <datalist id="team-names">
                      {teamNames.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </>
                )}
              </>
            )}
            {error && <p className="search-error">{error}</p>}
            <div className="row2">
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                Save
              </button>
            </div>
            {editing.id && editing.id !== me?.id && (
              <>
                <button
                  className="btn btn-ghost full"
                  disabled={busy}
                  onClick={() =>
                    act(() => setMemberRole(editing.id, editing.role === 'commissioner' ? 'member' : 'commissioner'))
                  }
                >
                  {editing.role === 'commissioner' ? 'Remove commissioner rights' : 'Make co-commissioner'}
                </button>
                <button
                  className="btn btn-ghost full danger"
                  disabled={busy}
                  onClick={() => confirm(`Remove ${editing.name} from the league?`) && act(() => removeMember(editing.id))}
                >
                  Remove from league
                </button>
              </>
            )}
          </section>
        ) : (
          <>
            {adding ? (
              <AddMembers
                league={data.league}
                members={members}
                meId={me?.userId}
                onClose={() => setAdding(false)}
                onAdded={async () => {
                  await reload();
                }}
              />
            ) : (
              <button className="btn btn-primary btn-xl" onClick={() => setAdding(true)}>
                + Add Scribble members
              </button>
            )}
            <button className="btn btn-ghost outline full invite-email-btn" onClick={() => setEditing({ ...blankMember })}>
              Invite someone by email
            </button>
          </>
        ))}
      {!isAdmin && <p className="hint center">Only the commissioner can change members and teams.</p>}
    </>
  );
}
