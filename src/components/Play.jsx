import { useEffect, useMemo, useRef, useState } from 'react';
import { computeRound } from '../lib/games/round.js';
import { segmentForHole } from '../lib/games/nassau.js';
import { wolfForHole } from '../lib/games/wolf.js';
import MoneyView, { Totals } from './MoneyView.jsx';
import Scorecard from './Scorecard.jsx';
import { nameMap } from './gameSummary.js';
import MatchCard from './MatchCard.jsx';
import { HoleBar, HoleDots, Keypad, ScoreBox } from './ScoreKeypad.jsx';
import { useKeypad } from './useKeypad.js';

export default function Play({ round, setRound, onSettle, onHome }) {
  const [tab, setTab] = useState('score');
  const computed = useMemo(() => computeRound(round), [round]);
  const hole = round.currentHole ?? 1;
  const h = hole - 1;
  const info = round.course.holes[h];
  const names = nameMap(round.players);
  const last = round.course.holes.length;

  const update = (fn) => setRound((r) => fn(structuredClone(r)));
  const keypad = useKeypad(hole);
  const goTo = (n) =>
    update((r) => {
      r.currentHole = Math.min(last, Math.max(1, n));
      return r;
    });
  // This hole's scores as they were when it opened, for Undo changes.
  const snap = useRef({ hole: null, values: {} });
  useEffect(() => {
    snap.current = { hole, values: Object.fromEntries(round.players.map((p) => [p.id, round.scores[p.id][hole - 1]])) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the hole changes
  }, [hole]);

  function setScore(id, value) {
    update((r) => {
      r.scores[id][h] = value == null ? null : Math.max(1, Math.min(15, value));
      return r;
    });
  }

  function updateGame(gameId, fn) {
    update((r) => {
      r.games = r.games.map((g) => (g.id === gameId ? fn(g) : g));
      return r;
    });
  }

  const wolf = round.games.find((g) => g.type === 'wolf');
  const nassau = round.games.find((g) => g.type === 'nassau');
  const holeScored = round.players.every((p) => round.scores[p.id][h] != null);
  const wolfMissing = wolf && !wolf.decisions[hole];
  const kp = keypad(
    round.players.map((p) => p.id),
    (id, v) => setScore(id, v),
  );
  const go = (n) => {
    kp.close();
    goTo(n);
  };
  const undo = () => {
    if (snap.current.hole !== hole) return;
    const vals = snap.current.values;
    update((r) => {
      for (const id of Object.keys(vals)) r.scores[id][h] = vals[id] ?? null;
      return r;
    });
    kp.close();
  };
  const save = () => {
    if (holeScored && hole < last) return go(hole + 1);
    kp.close();
  };
  // Gross to par so far, for the Total column.
  const toPar = (id) => {
    let t = 0;
    let any = false;
    round.scores[id].forEach((g, i) => {
      if (g == null) return;
      any = true;
      t += g - round.course.holes[i].par;
    });
    return any ? (t === 0 ? 'E' : t > 0 ? `+${t}` : String(t)) : '–';
  };

  return (
    <div className="screen play">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onHome}>
          ‹ Rounds
        </button>
        <div className="tabs" role="tablist">
          {[
            ['score', 'Score'],
            ['money', 'Money'],
            ['card', 'Card'],
          ].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={onSettle}>
          Settle
        </button>
      </div>

      {tab === 'money' && <MoneyView round={round} computed={computed} />}
      {tab === 'card' && (
        <Scorecard
          round={round}
          computed={computed}
          onPickHole={(n) => {
            goTo(n);
            setTab('score');
          }}
        />
      )}

      {tab === 'score' && (
        <>
          <HoleBar hole={hole} count={last} info={info} tee={round.tee?.name} onGo={go} />
          <HoleDots
            count={last}
            hole={hole}
            done={(i) => round.players.every((p) => round.scores[p.id][i] != null)}
            onGo={go}
          />

          {wolf && (
            <section className="card wolf-card">
              <div className="wolf-title">
                🐺 <strong>{names[wolfForHole(wolf.order, hole)]}</strong> is the wolf
              </div>
              <div className="wolf-picks">
                {wolf.order
                  .filter((id) => id !== wolfForHole(wolf.order, hole))
                  .map((id) => (
                    <WolfButton key={id} wolf={wolf} hole={hole} choice={{ partner: id }} updateGame={updateGame}>
                      + {names[id]}
                    </WolfButton>
                  ))}
                <WolfButton wolf={wolf} hole={hole} choice={{ lone: true }} updateGame={updateGame}>
                  Lone {wolf.loneMult}×
                </WolfButton>
                <WolfButton wolf={wolf} hole={hole} choice={{ blind: true }} updateGame={updateGame}>
                  Blind {wolf.blindMult}×
                </WolfButton>
              </div>
            </section>
          )}

          {computed.games
            .filter((g) => g.game.type === 'match')
            .flatMap((g) => g.matchups)
            .map((m, i) => (
              <MatchCard
                key={i}
                names={m.sides.map((side) => side.map((id) => names[id]).join(' & '))}
                status={m.status}
                compact
              />
            ))}
          <div className="gg-table">
            <div className="gg-head">
              <span>Player</span>
              <span>Score</span>
              <span>Net</span>
              <span>Total</span>
            </div>
            {round.players.map((p) => {
              const sc = round.scores[p.id][h];
              const strokes = computed.strokes[p.id][h];
              const t = toPar(p.id);
              return (
                <div key={p.id} className="gg-row">
                  <div className="gg-name">
                    <strong>
                      {p.name}
                      <span className="gg-hcp"> ({computed.playing[p.id]})</span>
                    </strong>
                  </div>
                  <ScoreBox
                    value={sc}
                    par={info.par}
                    strokes={strokes}
                    active={p.id === kp.activeKey}
                    label={`${p.name} score`}
                    onClick={() => kp.focus(p.id)}
                  />
                  <span className="gg-pts">{sc != null && strokes !== 0 ? sc - strokes : ''}</span>
                  <span className={`gg-total ${t.startsWith('-') ? 'under' : ''}`}>{t}</span>
                </div>
              );
            })}
          </div>

          {nassau && (
            <PressPanel nassau={nassau} hole={hole} names={names} updateGame={updateGame} computed={computed} />
          )}

          {!kp.open && (
            <div className="sticky-bottom bottom-bar">
              <Totals players={round.players} totals={computed.totals} />
              {hole < last ? (
                <button className="btn btn-primary btn-xl" onClick={() => go(hole + 1)} disabled={!holeScored}>
                  {holeScored ? (wolfMissing ? 'Next hole (no wolf pick)' : `Next: hole ${hole + 1}`) : 'Enter every score'}
                </button>
              ) : (
                <button className="btn btn-primary btn-xl" onClick={onSettle}>
                  {computed.finished ? 'Finish & settle up' : `Settle up (thru ${computed.holesComplete})`}
                </button>
              )}
            </div>
          )}
          <Keypad kp={kp} onUndo={undo} onSave={save} saveLabel={holeScored && hole < last ? 'Save scores' : 'Done'} />
        </>
      )}
    </div>
  );
}

function WolfButton({ wolf, hole, choice, updateGame, children }) {
  const current = wolf.decisions[hole];
  const on =
    current &&
    ((choice.partner && current.partner === choice.partner) ||
      (choice.lone && current.lone) ||
      (choice.blind && current.blind));
  return (
    <button
      className={`chip big ${on ? 'on' : ''}`}
      onClick={() =>
        updateGame(wolf.id, (g) => {
          const decisions = { ...g.decisions };
          if (on) delete decisions[hole];
          else decisions[hole] = choice;
          return { ...g, decisions };
        })
      }
    >
      {children}
    </button>
  );
}

function PressPanel({ nassau, hole, names, updateGame, computed }) {
  const segment = segmentForHole(hole);
  const segStart = segment === 'front' ? 1 : 10;
  if (hole === segStart) return null; // a press on the first hole of a nine is just the main bet
  const result = computed.games.find((g) => g.game.id === nassau.id);
  return (
    <section className="card">
      <h3>Press ({segment === 'front' ? 'front 9' : 'back 9'}) starting this hole</h3>
      <div className="stack">
        {nassau.matchups.map(([a, b], mi) => {
          const label = `${a.map((id) => names[id]).join(' & ')} vs ${b.map((id) => names[id]).join(' & ')}`;
          const exists = (nassau.presses ?? []).some(
            (p) => p.matchup === mi && p.segment === segment && p.hole === hole,
          );
          const autoHere = result?.matchups[mi].segments
            .find((s) => s.key === segment)
            ?.bets.some((bet) => bet.auto && bet.hole === hole);
          return (
            <button
              key={mi}
              className={`option ${exists ? 'on' : ''}`}
              onClick={() =>
                updateGame(nassau.id, (g) => {
                  const presses = (g.presses ?? []).filter(
                    (p) => !(p.matchup === mi && p.segment === segment && p.hole === hole),
                  );
                  if (!exists) presses.push({ matchup: mi, segment, hole });
                  return { ...g, presses };
                })
              }
            >
              {exists ? '✓ Pressed: ' : 'Press: '}
              {label}
              {autoHere && <span className="muted"> · auto press already on</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
