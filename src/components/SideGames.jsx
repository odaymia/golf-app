import { useState } from 'react';
import { computeSideGames, normalizeSideGames, anySideGames } from '../lib/league/sideGames.js';
import { formatMoney } from '../lib/games/money.js';
import { Switch } from './controls.jsx';

const NAMES = { skins: 'Skins', stableford: 'Stableford points', stroke: 'Stroke play' };
const HELP = {
  skins: 'Lowest score on a hole wins it (ties carry over). A hole counts once everyone in has finished it.',
  stableford:
    'Points for each hole vs par. You win or lose the stake for every point of difference with each other player in the game, so keep it small with a big field.',
  stroke:
    'Your total against each other player in the game: win the stake from everyone you beat (or per stroke). Adds up fast with a big field.',
};

// Commissioner: choose this round's side games, stakes and who's in.
export function SideGamesEditor({ event, members, busy, onSave }) {
  const [sg, setSg] = useState(() => normalizeSideGames(event.sideGames));
  const [dirty, setDirty] = useState(false);
  const active = members.filter((m) => m.active !== false);
  const everyone = !sg.players;
  const inIds = new Set(sg.players ?? active.map((m) => m.id));

  const set = (type, field, value) => {
    setSg((s) => ({ ...s, [type]: { ...s[type], [field]: value } }));
    setDirty(true);
  };
  const setPlayers = (players) => {
    setSg((s) => ({ ...s, players }));
    setDirty(true);
  };
  const toggle = (id) => {
    const next = new Set(inIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPlayers([...next]);
  };

  return (
    <section className="card side-games-edit">
      <h3>Side games</h3>
      <p className="hint">Bets across the whole field, settled automatically. Each group still scores on its own phone.</p>
      {['skins', 'stableford', 'stroke'].map((type) => {
        const g = sg[type];
        return (
          <div key={type} className={`game ${g.on ? 'on' : ''}`}>
            <div className="game-head">
              <strong>{NAMES[type]}</strong>
              <Switch label={`Play ${NAMES[type]}`} checked={g.on} onChange={(v) => set(type, 'on', v)} />
            </div>
            {g.on && (
              <div className="game-body">
                <p className="rules">{HELP[type]}</p>
                {type === 'skins' && (
                  <div className="seg wide">
                    <button className={g.mode === 'pot' ? 'on' : ''} onClick={() => set('skins', 'mode', 'pot')}>
                      Pot (buy-in)
                    </button>
                    <button className={g.mode !== 'pot' ? 'on' : ''} onClick={() => set('skins', 'mode', 'perSkin')}>
                      Pay per skin
                    </button>
                  </div>
                )}
                {type === 'stroke' && (
                  <div className="seg wide">
                    <button className={g.mode !== 'perStroke' ? 'on' : ''} onClick={() => set('stroke', 'mode', 'perOpponent')}>
                      Per player beaten
                    </button>
                    <button className={g.mode === 'perStroke' ? 'on' : ''} onClick={() => set('stroke', 'mode', 'perStroke')}>
                      Per stroke
                    </button>
                  </div>
                )}
                <div className="row2">
                  <label className="field money">
                    <span>
                      {type === 'skins'
                        ? g.mode === 'pot'
                          ? 'Buy-in per player'
                          : 'Per skin, from each player'
                        : type === 'stableford'
                          ? 'Per point'
                          : g.mode === 'perStroke'
                            ? 'Per stroke'
                            : 'Per player beaten'}
                    </span>
                    <div className="money-input">
                      <span>$</span>
                      {type === 'skins' && g.mode === 'pot' ? (
                        <input inputMode="decimal" value={g.buyIn} onChange={(e) => set(type, 'buyIn', e.target.value)} />
                      ) : (
                        <input inputMode="decimal" value={g.stake} onChange={(e) => set(type, 'stake', e.target.value)} />
                      )}
                    </div>
                  </label>
                  <div className="field">
                    <span>Scores</span>
                    <div className="seg wide">
                      <button className={g.net ? 'on' : ''} onClick={() => set(type, 'net', true)}>
                        Net
                      </button>
                      <button className={!g.net ? 'on' : ''} onClick={() => set(type, 'net', false)}>
                        Gross
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {anySideGames(sg) && (
        <>
          <h3 className="pairings-sub">Who’s in</h3>
          <div className="seg wide">
            <button className={everyone ? 'on' : ''} onClick={() => setPlayers(null)}>
              Everyone ({active.length})
            </button>
            <button className={!everyone ? 'on' : ''} onClick={() => setPlayers(active.map((m) => m.id))}>
              Pick players
            </button>
          </div>
          {!everyone && (
            <div className="chips">
              {active.map((m) => (
                <button key={m.id} className={`chip ${inIds.has(m.id) ? 'on' : ''}`} onClick={() => toggle(m.id)}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {dirty && (
        <button
          className="btn btn-primary full"
          disabled={busy}
          onClick={async () => {
            await onSave(sg);
            setDirty(false);
          }}
        >
          Save side games
        </button>
      )}
    </section>
  );
}

// Everyone: who's up and down in the side games, and who pays whom.
export function SideGamesBoard({ event, members, scores, indexes, handicap, meId }) {
  let result;
  try {
    result = computeSideGames({ event, members, scores, indexes, handicap });
  } catch {
    return <p className="muted center">Side games can’t be worked out yet.</p>;
  }
  if (!result) return null;
  const name = (id) => result.players.find((p) => p.id === id)?.name ?? '?';
  const rows = [...result.players].sort((a, b) => result.totals[b.id] - result.totals[a.id]);
  const skins = result.games.find((g) => g.game.type === 'skins');
  const holes = event.course.holes.length;

  return (
    <section className="card side-games">
      <h3>Side games</h3>
      <p className="muted small">
        {result.games.map((g) => NAMES[g.game.type]).join(' · ')} · {result.players.length} players ·{' '}
        {result.holesComplete === holes ? 'Final' : `${result.holesComplete} of ${holes} holes counted so far`}
      </p>
      {skins && Object.values(skins.won ?? {}).some((n) => n > 0) && (
        <p className="side-skins">
          <strong>Skins:</strong>{' '}
          {Object.entries(skins.won)
            .filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([id, n]) => `${name(id)} ${n}`)
            .join(' · ')}
          {skins.carry > 0 && <span className="muted"> · {skins.carry} carrying</span>}
        </p>
      )}
      <ul className="side-money">
        {rows.map((p) => {
          const c = result.totals[p.id];
          return (
            <li key={p.id} className={p.id === meId ? 'mine' : ''}>
              <span>{p.name}</span>
              <strong className={c > 0 ? 'up' : c < 0 ? 'down' : ''}>{c === 0 ? 'Even' : `${c > 0 ? '+' : '−'}${formatMoney(Math.abs(c))}`}</strong>
            </li>
          );
        })}
      </ul>
      {result.payments.length > 0 && (
        <>
          <h3 className="pairings-sub">{result.holesComplete === holes ? 'Settle up' : 'If it ended now'}</h3>
          <ul className="lines side-pay">
            {result.payments.map((p, i) => (
              <li key={i}>
                <strong>{name(p.from)}</strong> pays <strong>{name(p.to)}</strong> {formatMoney(p.cents)}
              </li>
            ))}
          </ul>
          <p className="hint">Pay each other directly (cash, Venmo). Scribble never holds money.</p>
        </>
      )}
    </section>
  );
}
