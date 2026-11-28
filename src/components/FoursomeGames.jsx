import { useEffect, useMemo, useState } from 'react';
import { computeFoursomeGames, groupKey, holeChoices, newSet, normalizeSet, setsForGroup, teamBallHoles } from '../lib/league/foursomeGames.js';
import { loadEventGames, saveGroupGames } from '../lib/leagueApi.js';
import { GAME_INFO } from '../lib/roundSetup.js';
import GamePicker from './GamePicker.jsx';
import MoneyView, { Payments, Totals } from './MoneyView.jsx';
import { gameTitle } from './gameSummary.js';

const holesText = (s, n) => (s.from === 1 && s.to === n ? `All ${n} holes` : `Holes ${s.from}–${s.to}`);

// Side games in a league/tournament round, played off everyone's scores
// (lib/league/foursomeGames.js). A foursome sets them up and can include any
// player in the round; anyone in that foursome can change them. Other
// groups' games that include one of us show here too (theirs to change).
// The leaderboard isn't affected.
// players: my foursome [{ id, name, index }] in score-entry order; field:
// everyone in the round (incl. my foursome); scores: { id: gross[] } for the
// field; indexes / handicap: this round's.
export default function FoursomeGames({ event, players, field = players, scores, indexes, handicap, onBack }) {
  const n = event.course.holes.length;
  const myIds = useMemo(() => players.map((p) => p.id), [players]);
  const key = groupKey(myIds);
  const [rows, setRows] = useState(null); // every group's saved sets
  const sets = rows === null ? null : (rows.find((r) => r.group_key === key)?.sets ?? []);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // a set being added or changed
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let live = true;
    loadEventGames(event.id)
      .then((r) => live && setRows(r))
      .catch((e) => {
        if (!live) return;
        setError(e.message);
        setRows([]);
      });
    return () => {
      live = false;
    };
  }, [event.id, key]);

  // My foursome first, then everyone else in the round.
  const everyone = useMemo(() => [...players, ...field.filter((p) => !myIds.includes(p.id))], [players, field, myIds]);
  const visible = useMemo(() => setsForGroup(rows ?? [], myIds), [rows, myIds]);
  const result = useMemo(
    () => computeFoursomeGames({ event, members: everyone, scores, indexes, handicap, sets: visible.map((x) => x.set) }),
    [event, everyone, scores, indexes, handicap, visible],
  );
  const inMoney = everyone.filter((p) => result.involved.includes(p.id));
  const nameOf = (id) => everyone.find((p) => p.id === id)?.name ?? '?';
  const allDone = result.sets.length > 0 && result.sets.every((x) => x.computed.finished);

  const persist = async (next) => {
    setBusy(true);
    setError('');
    try {
      await saveGroupGames(event.id, key, next);
      setRows((rs) => [...(rs ?? []).filter((r) => r.group_key !== key), { group_key: key, sets: next }]);
      setEditing(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <SetEditor
        event={event}
        players={players}
        others={everyone.filter((p) => !myIds.includes(p.id))}
        set={editing}
        busy={busy}
        error={error}
        onCancel={() => setEditing(null)}
        onSave={(set) => persist([...(sets ?? []).filter((x) => x.id !== set.id), set])}
        onDelete={(sets ?? []).some((x) => x.id === editing.id) ? () => persist(sets.filter((x) => x.id !== editing.id)) : null}
      />
    );
  }

  return (
    <section className="foursome-games">
      <div className="fg-head">
        <button className="btn btn-ghost" onClick={onBack}>
          ‹ Scores
        </button>
        <h3>Side games</h3>
        <span />
      </div>
      <p className="hint">
        Games on any holes you like, with anyone playing this round, played off everyone’s scores. They don’t change the
        leaderboard. Scribble never holds or moves money.
      </p>
      {error && <div className="card warn-box">{error}</div>}
      {sets === null && <p className="muted center">Loading…</p>}

      {result.sets.length > 0 && (
        <section className="card settle-card">
          <h3>{allDone ? 'Who pays who' : 'If it ended now'}</h3>
          <Payments players={inMoney} payments={result.payments} />
          <Totals players={inMoney} totals={result.totals} />
        </section>
      )}

      {visible.map(({ set: raw, own, owner }) => {
        const set = normalizeSet(raw, n, everyone.map((p) => p.id));
        const ran = result.sets.find((x) => x.set.id === set.id);
        const names = everyone.filter((p) => set.players.includes(p.id)).map((p) => p.name);
        const sameAsUs = names.length === players.length && players.every((p) => set.players.includes(p.id));
        const games = Object.keys(GAME_INFO).filter((t) => set.settings[t]?.on);
        return (
          <section key={set.id} className="card fg-set">
            <div className="fg-set-head">
              <div>
                <strong>{holesText(set, n)}</strong>
                <span className="muted small">
                  {' '}
                  · {ran ? ran.computed.games.map((g) => gameTitle(g.game)).join(', ') : games.map((t) => GAME_INFO[t].name).join(', ') || 'No games on'}
                </span>
                {!sameAsUs && <p className="muted small fg-who">{names.join(', ')}</p>}
                {!own && (
                  <p className="muted small fg-who">
                    Set up by {owner.split(',').map(nameOf).map((x) => x.split(' ')[0]).join(', ')}
                  </p>
                )}
              </div>
              {own && (
                <button className="btn btn-ghost btn-small" onClick={() => setEditing(structuredClone(set))}>
                  Edit
                </button>
              )}
            </div>
            {ran && (
              <>
                <button className="link small-link" onClick={() => setOpen(open === set.id ? null : set.id)}>
                  {open === set.id ? 'Hide details' : `Details · thru ${ran.computed.holesComplete} of ${set.to - set.from + 1}`}
                </button>
                {open === set.id && <MoneyView round={ran.round} computed={ran.computed} />}
              </>
            )}
          </section>
        );
      })}

      {sets !== null && (
        <button className="btn btn-primary btn-xl" onClick={() => setEditing(newSet(players, n))}>
          + Add side games
        </button>
      )}
      {visible.length === 0 && sets !== null && (
        <p className="hint center">
          Mix it up: skins on the back nine with the group behind you, a Nassau on all 18, Wolf on the holes after the
          scramble. Each set of games can cover different holes and players.
        </p>
      )}
    </section>
  );
}

// Add or change one set of games: which holes, who's in, which games.
function SetEditor({ event, players, others = [], set: initial, busy, error, onCancel, onSave, onDelete }) {
  const n = event.course.holes.length;
  const [set, setSet] = useState(initial);
  const choices = holeChoices(event);
  const all = [...players, ...others];
  const inPlayers = all.filter((p) => set.players.includes(p.id));
  const count = set.to - set.from + 1;
  const shared = teamBallHoles(event, set.from, set.to);
  const setSettings = (fn) => setSet((s) => ({ ...s, settings: typeof fn === 'function' ? fn(s.settings) : fn }));
  const toggle = (id) =>
    setSet((s) => ({ ...s, players: s.players.includes(id) ? s.players.filter((x) => x !== id) : all.map((p) => p.id).filter((x) => x === id || s.players.includes(x)) }));
  const anyOn = Object.keys(GAME_INFO).some((t) => set.settings[t]?.on);
  return (
    <section className="foursome-games">
      <div className="fg-head">
        <button className="btn btn-ghost" onClick={onCancel}>
          ‹ Back
        </button>
        <h3>Side games</h3>
        <span />
      </div>

      <section className="card">
        <h3>Which holes?</h3>
        <div className="chips">
          {choices.map((c) => (
            <button
              key={`${c.from}-${c.to}`}
              className={`chip ${set.from === c.from && set.to === c.to ? 'on' : ''}`}
              onClick={() => setSet((s) => ({ ...s, from: c.from, to: c.to }))}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="row2">
          <label className="field">
            <span>From hole</span>
            <select value={set.from} onChange={(e) => setSet((s) => ({ ...s, from: Number(e.target.value), to: Math.max(s.to, Number(e.target.value)) }))}>
              {Array.from({ length: n }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>To hole</span>
            <select value={set.to} onChange={(e) => setSet((s) => ({ ...s, to: Number(e.target.value) }))}>
              {Array.from({ length: n - set.from + 1 }, (_, i) => set.from + i).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        </div>
        {shared.length > 0 && (
          <p className="hint fg-warn">
            Holes {shared[0]}–{shared[shared.length - 1]} are a one-ball format (partners share a score), so games between
            teammates there are a wash. Team games (2 vs 2) still work.
          </p>
        )}
      </section>

      <section className="card">
        <h3>Who’s in?</h3>
        <div className="chips">
          {players.map((p) => (
            <button key={p.id} className={`chip ${set.players.includes(p.id) ? 'on' : ''}`} onClick={() => toggle(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        {others.length > 0 && (
          <>
            <p className="muted small fg-others">Anyone else playing this round</p>
            <div className="chips">
              {others.map((p) => (
                <button key={p.id} className={`chip ${set.players.includes(p.id) ? 'on' : ''}`} onClick={() => toggle(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}
        {inPlayers.length < 2 && <p className="search-error">Pick at least 2 players.</p>}
      </section>

      <GamePicker settings={set.settings} setSettings={setSettings} players={inPlayers} holeCount={count} allowSplit={false} />

      {error && <div className="card error-box">{error}</div>}
      <button className="btn btn-primary btn-xl" disabled={busy || inPlayers.length < 2 || !anyOn} onClick={() => onSave(set)}>
        {busy ? 'Saving…' : !anyOn ? 'Turn on a game' : 'Save side games'}
      </button>
      {onDelete && (
        <button className="btn btn-ghost full" disabled={busy} onClick={() => confirm('Remove these side games?') && onDelete()}>
          Remove these side games
        </button>
      )}
    </section>
  );
}
