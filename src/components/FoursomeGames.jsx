import { useEffect, useMemo, useState } from 'react';
import { computeFoursomeGames, groupKey, holeChoices, newSet, normalizeSet, teamBallHoles } from '../lib/league/foursomeGames.js';
import { loadGroupGames, saveGroupGames } from '../lib/leagueApi.js';
import { GAME_INFO } from '../lib/roundSetup.js';
import GamePicker from './GamePicker.jsx';
import MoneyView, { Payments, Totals } from './MoneyView.jsx';
import { gameTitle } from './gameSummary.js';

const holesText = (s, n) => (s.from === 1 && s.to === n ? `All ${n} holes` : `Holes ${s.from}–${s.to}`);

// A foursome's own side games in a league/tournament round, played off the
// scores they're entering (lib/league/foursomeGames.js). Anyone in the group
// can add or change them; the leaderboard isn't affected.
// players: the group [{ id, name, index }] in score-entry order (teammates
// together); scores: { id: gross[] }; indexes / handicap: this round's.
export default function FoursomeGames({ event, players, scores, indexes, handicap, onBack }) {
  const n = event.course.holes.length;
  const key = groupKey(players.map((p) => p.id));
  const [sets, setSets] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // a set being added or changed
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let live = true;
    loadGroupGames(event.id, key)
      .then((s) => live && setSets(s))
      .catch((e) => {
        if (!live) return;
        setError(e.message);
        setSets([]);
      });
    return () => {
      live = false;
    };
  }, [event.id, key]);

  const result = useMemo(
    () => computeFoursomeGames({ event, members: players, scores, indexes, handicap, sets: sets ?? [] }),
    [event, players, scores, indexes, handicap, sets],
  );
  const allDone = result.sets.length > 0 && result.sets.every((x) => x.computed.finished);

  const persist = async (next) => {
    setBusy(true);
    setError('');
    try {
      await saveGroupGames(event.id, key, next);
      setSets(next);
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
        Your foursome’s own games, on any holes you like, played off the scores you’re entering. They don’t change the
        leaderboard. Scribble never holds or moves money.
      </p>
      {error && <div className="card warn-box">{error}</div>}
      {sets === null && <p className="muted center">Loading…</p>}

      {result.sets.length > 0 && (
        <section className="card settle-card">
          <h3>{allDone ? 'Who pays who' : 'If it ended now'}</h3>
          <Payments players={players} payments={result.payments} />
          <Totals players={players} totals={result.totals} />
        </section>
      )}

      {(sets ?? []).map((raw) => {
        const set = normalizeSet(raw, n, players.map((p) => p.id));
        const ran = result.sets.find((x) => x.set.id === set.id);
        const names = players.filter((p) => set.players.includes(p.id)).map((p) => p.name);
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
                {names.length < players.length && <p className="muted small fg-who">{names.join(', ')}</p>}
              </div>
              <button className="btn btn-ghost btn-small" onClick={() => setEditing(structuredClone(set))}>
                Edit
              </button>
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
      {sets?.length === 0 && (
        <p className="hint center">
          Mix it up: skins on the back nine, a Nassau on all 18, Wolf on the holes after the scramble. Each set of games can
          cover different holes and players.
        </p>
      )}
    </section>
  );
}

// Add or change one set of games: which holes, who's in, which games.
function SetEditor({ event, players, set: initial, busy, error, onCancel, onSave, onDelete }) {
  const n = event.course.holes.length;
  const [set, setSet] = useState(initial);
  const choices = holeChoices(event);
  const inPlayers = players.filter((p) => set.players.includes(p.id));
  const count = set.to - set.from + 1;
  const shared = teamBallHoles(event, set.from, set.to);
  const setSettings = (fn) => setSet((s) => ({ ...s, settings: typeof fn === 'function' ? fn(s.settings) : fn }));
  const toggle = (id) =>
    setSet((s) => ({ ...s, players: s.players.includes(id) ? s.players.filter((x) => x !== id) : players.map((p) => p.id).filter((x) => x === id || s.players.includes(x)) }));
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
