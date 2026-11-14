import { useEffect, useState } from 'react';
import { deletePlayer, listSavedPlayers, saveProfile, savePlayer, signOut } from '../lib/account.js';
import { formatIndex, parseIndex } from '../lib/roundSetup.js';
import { getPublicProfile, syncHomeCourse } from '../lib/social.js';
import HomeCoursePicker from './HomeCoursePicker.jsx';

const indexText = (n) => (n == null ? '' : formatIndex(n));

// firstTime: shown right after the first sign-in, before the app opens.
export default function Profile({ user, profile, onSaved, onBack, firstTime = false }) {
  const [form, setForm] = useState(() => ({
    name: profile?.name ?? '',
    ghinNumber: profile?.ghinNumber ?? '',
    indexText: indexText(profile?.index),
    home: profile?.homeCourse ? { name: profile.homeCourse, key: profile.homeCourseKey ?? null, place: '' } : null,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = (field, value) => {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: value }));
  };

  // The golf profile may already have a home course (with its course link).
  useEffect(() => {
    if (firstTime) return;
    getPublicProfile(user.id)
      .then((p) => {
        if (p?.homeCourse)
          setForm((f) => ({ ...f, home: { name: p.homeCourse, key: p.homeCourseKey, place: p.homeCoursePlace } }));
      })
      .catch(() => {});
  }, [user.id, firstTime]);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Enter your name.');
    const index = parseIndex(form.indexText);
    if (index === null) return setError('Handicap index should be a number like 12.4, or +2.1 for a plus.');
    setBusy(true);
    setError('');
    try {
      const p = await saveProfile(user, {
        ...form,
        homeCourse: form.home?.name ?? '',
        index: form.indexText.trim() === '' ? null : index,
      });
      // Keep the golf profile's home course the same (if one exists yet).
      syncHomeCourse(user.id, form.home).catch(() => {});
      setSaved(true);
      onSaved(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        {firstTime ? <span /> : (
          <button className="btn btn-ghost" onClick={onBack}>
            ‹ Back
          </button>
        )}
        <h1>{firstTime ? 'Your profile' : 'Profile'}</h1>
        <span />
      </div>

      <form className="card" onSubmit={submit}>
        {firstTime && <p className="muted">Set up your profile once. It fills in your spot on every round.</p>}
        <label className="field">
          <span>Name</span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
        </label>
        <div className="row2">
          <label className="field">
            <span>Handicap index</span>
            <input
              inputMode="decimal"
              value={form.indexText}
              placeholder="e.g. 12.4"
              onChange={(e) => set('indexText', e.target.value)}
            />
          </label>
          <label className="field">
            <span>GHIN number</span>
            <input
              inputMode="numeric"
              value={form.ghinNumber}
              placeholder="Optional"
              onChange={(e) => set('ghinNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
          </label>
        </div>
        <div className="field">
          <span>Home course</span>
          <HomeCoursePicker value={form.home} onChange={(home) => set('home', home)} disabled={busy} />
        </div>
        <p className="hint">
          Your handicap index is self-reported for now. Live GHIN handicaps come once the USGA approves the app.
        </p>
        {error && <p className="search-error">{error}</p>}
        <button className="btn btn-primary btn-xl" disabled={busy}>
          {busy ? 'Saving…' : firstTime ? 'Save and start' : saved ? 'Saved ✓' : 'Save profile'}
        </button>
      </form>

      {!firstTime && (
        <>
          <SavedPlayers />
          <section className="card">
            <p className="muted">Signed in as {user.email}</p>
            <button className="btn btn-ghost full" onClick={() => signOut()}>
              Sign out
            </button>
          </section>
        </>
      )}
    </div>
  );
}

const blankPlayer = { id: null, name: '', ghinNumber: '', indexText: '' };

function SavedPlayers() {
  const [players, setPlayers] = useState(null);
  const [editing, setEditing] = useState(null); // player being added/edited
  const [error, setError] = useState('');

  useEffect(() => {
    listSavedPlayers()
      .then(setPlayers)
      .catch((e) => {
        setPlayers([]);
        setError(e.message);
      });
  }, []);

  async function save() {
    if (!editing.name.trim()) return setError('Enter a name.');
    const index = parseIndex(editing.indexText);
    if (index === null) return setError('Handicap index should be a number like 12.4, or +2.1.');
    setError('');
    try {
      const p = await savePlayer({ ...editing, index: editing.indexText.trim() === '' ? null : index });
      setPlayers((ps) => [...ps.filter((x) => x.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(p) {
    if (!confirm(`Remove ${p.name} from your players?`)) return;
    try {
      await deletePlayer(p.id);
      setPlayers((ps) => ps.filter((x) => x.id !== p.id));
      setEditing(null);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="card">
      <h2>My players</h2>
      <p className="hint">The people you play with. Add them to a round with one tap.</p>
      {players === null && <p className="muted">Loading…</p>}
      <ul className="saved-players">
        {players?.map((p) => (
          <li key={p.id}>
            <button
              className="saved-player"
              onClick={() => setEditing({ ...p, indexText: indexText(p.index) })}
            >
              <strong>{p.name}</strong>
              <span className="muted">
                {p.index == null ? 'No index' : `Index ${formatIndex(p.index)}`}
                {p.ghinNumber ? ` · GHIN ${p.ghinNumber}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <div className="player-editor">
          <label className="field">
            <span>Name</span>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
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
                onChange={(e) =>
                  setEditing({ ...editing, ghinNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })
                }
              />
            </label>
          </div>
          {error && <p className="search-error">{error}</p>}
          <div className="row2">
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save}>
              Save player
            </button>
          </div>
          {editing.id && (
            <button className="btn btn-ghost full danger" onClick={() => remove(editing)}>
              Remove player
            </button>
          )}
        </div>
      ) : (
        <>
          {error && <p className="search-error">{error}</p>}
          <button className="btn btn-ghost full" onClick={() => setEditing({ ...blankPlayer })}>
            + Add player
          </button>
        </>
      )}
    </section>
  );
}
