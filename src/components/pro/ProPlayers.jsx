import { useMemo, useState } from 'react';
import AddMembers from '../AddMembers.jsx';
import { addMember, addMembers, inviteLink, removeMember, setMemberRole, updateMember } from '../../lib/leagueApi.js';
import { looksLikeEmail } from '../../lib/account.js';
import { formatIndex, parseIndex } from '../../lib/roundSetup.js';
import { parseRoster, splitNew } from '../../lib/league/pro.js';
import { orderEvents } from '../../lib/league/season.js';

const statusOf = (m) => (m.active ? (m.pending ? 'Waiting to accept' : 'Active') : m.inviteEmail ? 'Invited' : 'Needs account');
const idx = (n) => (n == null ? '' : formatIndex(n));

// Roster: every player, sortable and editable, plus email invites and import.
export default function ProPlayers({ data, computed, me, isAdmin, reload }) {
  const { members, league } = data;
  const { settings } = computed;
  const usesTeams = settings.unit !== 'individual';
  const teamNames = settings.unit === 'ryder' ? settings.sides : [...new Set(members.map((m) => m.team).filter(Boolean))].sort();
  const lastEvent = orderEvents(data.events).at(-1);
  const leagueIdx = settings.handicap.mode === 'league' && lastEvent ? computed.indexes[lastEvent.id] : null;

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [editing, setEditing] = useState(null); // member id or 'new'
  const [form, setForm] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = members.filter(
      (m) => !q || m.name.toLowerCase().includes(q) || (m.team ?? '').toLowerCase().includes(q) || (m.inviteEmail ?? '').includes(q),
    );
    const val = (m) =>
      sort.key === 'index' ? (m.index ?? 999) : sort.key === 'status' ? statusOf(m) : sort.key === 'team' ? (m.team || '~') : m.name.toLowerCase();
    return [...list].sort((a, b) => (val(a) < val(b) ? -sort.dir : val(a) > val(b) ? sort.dir : 0));
  }, [members, query, sort]);

  const th = (key, label) => (
    <th>
      <button className="th-sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
        {label}
        {sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  async function run(fn, done) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await reload();
      done?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(m) {
    setEditing(m ? m.id : 'new');
    setForm(
      m
        ? { name: m.name, email: m.inviteEmail ?? '', indexText: idx(m.index), ghinNumber: m.ghinNumber ?? '', team: m.team ?? '', userId: m.userId }
        : { name: '', email: '', indexText: '', ghinNumber: '', team: '', userId: null },
    );
  }

  function saveEdit() {
    const index = parseIndex(form.indexText);
    if (!form.name.trim()) return setError('Enter a name.');
    if (index === null) return setError('Index should be a number like 12.4, or +2.1.');
    if (!form.userId && !looksLikeEmail(form.email)) return setError('Enter an email so they can join with a Scribble account.');
    const m = { ...form, index: form.indexText.trim() === '' ? null : index };
    if (form.userId) delete m.email;
    run(() => (editing === 'new' ? addMember(league.id, m) : updateMember(editing, m)), () => setEditing(null));
  }

  async function setTeamFor(team) {
    const ids = [...selected];
    await run(async () => {
      for (const id of ids) {
        const m = members.find((x) => x.id === id);
        await updateMember(id, { ...m, team });
      }
    }, () => setSelected(new Set()));
  }

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const counts = {
    active: members.filter((m) => m.active).length,
    invited: members.filter((m) => !m.active).length,
  };

  return (
    <div className="pro-page">
      <div className="pro-page-head">
        <h2 className="pro-h">Players</h2>
        <span className="muted">
          {counts.active} active{counts.invited ? ` · ${counts.invited} waiting to join` : ''}
        </span>
        {isAdmin && (
          <div className="pro-actions">
            <button className="btn btn-ghost outline" onClick={() => setImporting((v) => !v)}>
              {importing ? 'Close import' : 'Import roster'}
            </button>
            <button className="btn btn-ghost outline" onClick={() => startEdit(null)}>
              Invite by email
            </button>
            <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
              {adding ? 'Close' : '+ Add Scribble members'}
            </button>
          </div>
        )}
      </div>
      {adding && (
        <AddMembers league={league} members={members} meId={me?.userId} onClose={() => setAdding(false)} onAdded={() => reload()} />
      )}
      <p className="hint">
        Every player needs a Scribble account. Invited players join their spot when they sign in with the email you entered, or
        open your invite link:{' '}
        <code className="pro-code">{inviteLink(league.code)}</code>
      </p>

      {importing && isAdmin && (
        <ImportRoster
          members={members}
          busy={busy}
          onImport={(fresh) =>
            run(
              () => addMembers(league.id, fresh),
              () => {
                setImporting(false);
                setNotice(`Invited ${fresh.length} player${fresh.length === 1 ? '' : 's'}.`);
              },
            )
          }
        />
      )}

      {error && <div className="pro-alert error">{error}</div>}
      {notice && <div className="pro-alert ok">{notice}</div>}

      <div className="pro-toolbar">
        <input className="pro-search" placeholder="Search players, teams, emails…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {isAdmin && usesTeams && selected.size > 0 && (
          <div className="pro-bulk">
            <span>{selected.size} selected:</span>
            {teamNames.map((t) => (
              <button key={t} className="btn btn-ghost btn-small outline" disabled={busy} onClick={() => setTeamFor(t)}>
                {settings.unit === 'ryder' ? t : `→ ${t}`}
              </button>
            ))}
            {settings.unit !== 'ryder' && (
              <button
                className="btn btn-ghost btn-small outline"
                disabled={busy}
                onClick={() => {
                  const t = prompt('New team name');
                  if (t?.trim()) setTeamFor(t.trim());
                }}
              >
                New team…
              </button>
            )}
            <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => setTeamFor('')}>
              No team
            </button>
          </div>
        )}
      </div>

      <div className="pro-table-wrap">
        <table className="pro-table">
          <thead>
            <tr>
              {isAdmin && usesTeams && <th className="check" />}
              {th('name', 'Name')}
              {th('status', 'Status')}
              {th('index', 'Index')}
              {leagueIdx && <th>League index</th>}
              <th>GHIN</th>
              {usesTeams && th('team', settings.unit === 'ryder' ? 'Side' : 'Team')}
              <th>Role</th>
              {isAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {editing === 'new' && (
              <EditRow form={form} setForm={setForm} usesTeams={usesTeams} teamNames={teamNames} ryder={settings.unit === 'ryder'} leagueIdx={!!leagueIdx} admin={isAdmin} busy={busy} onSave={saveEdit} onCancel={() => setEditing(null)} />
            )}
            {rows.map((m) =>
              editing === m.id ? (
                <EditRow key={m.id} form={form} setForm={setForm} usesTeams={usesTeams} teamNames={teamNames} ryder={settings.unit === 'ryder'} leagueIdx={!!leagueIdx} admin={isAdmin} busy={busy} onSave={saveEdit} onCancel={() => setEditing(null)} />
              ) : (
                <tr key={m.id} className={m.active ? '' : 'pending'}>
                  {isAdmin && usesTeams && (
                    <td className="check">
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Select ${m.name}`} />
                    </td>
                  )}
                  <td className="strong">
                    {m.name}
                    {m.id === me?.id && <span className="muted"> (you)</span>}
                  </td>
                  <td>
                    <span className={`pill ${m.active ? 'ok' : 'wait'}`}>{statusOf(m)}</span>
                    {!m.active && m.inviteEmail && <span className="muted small"> {m.inviteEmail}</span>}
                  </td>
                  <td>{idx(m.index) || <span className="muted">–</span>}</td>
                  {leagueIdx && <td>{leagueIdx[m.id] != null ? idx(leagueIdx[m.id]) : '–'}</td>}
                  <td className="muted">{m.ghinNumber || '–'}</td>
                  {usesTeams && <td>{m.team || <span className="muted">–</span>}</td>}
                  <td className="muted">{m.role === 'commissioner' ? 'Commissioner' : 'Player'}</td>
                  {isAdmin && (
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-small" onClick={() => startEdit(m)}>
                        Edit
                      </button>
                      {m.active && m.id !== me?.id && (
                        <button
                          className="btn btn-ghost btn-small"
                          disabled={busy}
                          onClick={() => run(() => setMemberRole(m.id, m.role === 'commissioner' ? 'member' : 'commissioner'))}
                        >
                          {m.role === 'commissioner' ? 'Remove admin' : 'Make admin'}
                        </button>
                      )}
                      {m.id !== me?.id && (
                        <button
                          className="btn btn-ghost btn-small danger"
                          disabled={busy}
                          onClick={() => confirm(`Remove ${m.name}?`) && run(() => removeMember(m.id))}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted center">No players match.</p>}
      </div>
    </div>
  );
}

function EditRow({ form, setForm, usesTeams, teamNames, ryder, leagueIdx, admin, busy, onSave, onCancel }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <tr className="editing">
      {admin && usesTeams && <td className="check" />}
      <td>
        <input value={form.name} placeholder="Name" onChange={(e) => set('name', e.target.value)} autoFocus />
      </td>
      <td>
        {form.userId ? (
          <span className="pill ok">Active</span>
        ) : (
          <input type="email" value={form.email} placeholder="Email to invite" onChange={(e) => set('email', e.target.value)} />
        )}
      </td>
      <td>
        <input className="narrow" inputMode="decimal" value={form.indexText} placeholder="12.4" onChange={(e) => set('indexText', e.target.value)} />
      </td>
      {leagueIdx && <td />}
      <td>
        <input className="narrow" inputMode="numeric" value={form.ghinNumber} placeholder="GHIN" onChange={(e) => set('ghinNumber', e.target.value.replace(/\D/g, ''))} />
      </td>
      {usesTeams && (
        <td>
          {ryder ? (
            <select value={form.team} onChange={(e) => set('team', e.target.value)}>
              <option value="">–</option>
              {teamNames.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          ) : (
            <>
              <input list="pro-teams" value={form.team} placeholder="Team" onChange={(e) => set('team', e.target.value)} />
              <datalist id="pro-teams">
                {teamNames.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </>
          )}
        </td>
      )}
      <td />
      <td className="row-actions">
        <button className="btn btn-primary btn-small" disabled={busy} onClick={onSave}>
          Save
        </button>
        <button className="btn btn-ghost btn-small" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

function ImportRoster({ members, busy, onImport }) {
  const [text, setText] = useState('');
  const { players, problems } = useMemo(() => parseRoster(text), [text]);
  const { fresh, dupes } = useMemo(() => splitNew(players, members), [players, members]);
  const ready = fresh.filter((p) => looksLikeEmail(p.email));
  const noEmail = fresh.filter((p) => !looksLikeEmail(p.email));

  return (
    <section className="pro-card">
      <h3>Import a roster</h3>
      <p className="hint">
        Copy the rows from Excel or Google Sheets (or a CSV) and paste them here. Columns can be in any order if the first row
        has headers: <strong>Name</strong> (or First / Last), <strong>Email</strong>, <strong>Index</strong>,{' '}
        <strong>GHIN</strong>, <strong>Team</strong>. Everyone needs an email to get their invite.
      </p>
      <textarea
        className="pro-paste"
        rows={7}
        value={text}
        placeholder={'Name\tEmail\tIndex\tTeam\nMike Jones\tmike@example.com\t4.2\tEagles'}
        onChange={(e) => setText(e.target.value)}
      />
      {players.length > 0 && (
        <>
          <div className="pro-import-summary">
            <span className="pill ok">{ready.length} ready to invite</span>
            {noEmail.length > 0 && <span className="pill wait">{noEmail.length} missing an email</span>}
            {dupes.length > 0 && <span className="pill">{dupes.length} already on the roster</span>}
            {problems.length > 0 && <span className="pill wait">{problems.length} to check</span>}
          </div>
          <table className="pro-table compact">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Index</th>
                <th>GHIN</th>
                <th>Team</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {players.slice(0, 200).map((p, i) => {
                const dupe = dupes.includes(p);
                const missing = !dupe && !looksLikeEmail(p.email);
                return (
                  <tr key={i} className={dupe || missing ? 'pending' : ''}>
                    <td className="strong">{p.name}</td>
                    <td>{p.email || <span className="muted">–</span>}</td>
                    <td>{p.index == null ? '–' : formatIndex(p.index)}</td>
                    <td>{p.ghinNumber || '–'}</td>
                    <td>{p.team || '–'}</td>
                    <td className="muted small">{dupe ? 'Already on roster' : missing ? 'Needs an email' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {problems.length > 0 && (
            <ul className="pro-problems">
              {problems.map((p, i) => (
                <li key={i}>
                  Row {p.line}: {p.message}
                </li>
              ))}
            </ul>
          )}
          <button className="btn btn-primary" disabled={busy || !ready.length} onClick={() => onImport(ready)}>
            {busy ? 'Inviting…' : `Invite ${ready.length} player${ready.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </section>
  );
}
