import { useMemo, useState } from 'react';
import { computeRound } from '../lib/games/round.js';
import { segmentForHole } from '../lib/games/nassau.js';
import { wolfForHole } from '../lib/games/wolf.js';
import MoneyView, { Totals } from './MoneyView.jsx';
import Scorecard from './Scorecard.jsx';
import { nameMap } from './gameSummary.js';
import MatchCard from './MatchCard.jsx';

export default function Play({ round, setRound, onSettle, onHome }) {
  const [tab, setTab] = useState('score');
  const computed = useMemo(() => computeRound(round), [round]);
  const hole = round.currentHole ?? 1;
  const h = hole - 1;
  const info = round.course.holes[h];
  const names = nameMap(round.players);
  const last = round.course.holes.length;

  const update = (fn) => setRound((r) => fn(structuredClone(r)));
  const goTo = (n) =>
    update((r) => {
      r.currentHole = Math.min(last, Math.max(1, n));
      return r;
    });

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
          <div className="hole-head">
            <button className="nav-btn" onClick={() => goTo(hole - 1)} disabled={hole === 1} aria-label="Previous hole">
              ‹
            </button>
            <div className="hole-title">
              <div className="hole-num">Hole {hole}</div>
              <div className="muted">
                Par {info.par} · Hcp {info.hcp}
              </div>
            </div>
            <button className="nav-btn" onClick={() => goTo(hole + 1)} disabled={hole === last} aria-label="Next hole">
              ›
            </button>
          </div>
          <div className="hole-dots">
            {round.course.holes.map((_, i) => {
              const done = round.players.every((p) => round.scores[p.id][i] != null);
              return (
                <button
                  key={i}
                  className={`dot ${done ? 'done' : ''} ${i === h ? 'here' : ''}`}
                  onClick={() => goTo(i + 1)}
                  aria-label={`Hole ${i + 1}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

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
          <div className="score-rows">
            {round.players.map((p) => {
              const s = round.scores[p.id][h];
              const strokes = computed.strokes[p.id][h];
              const diff = s == null ? null : s - info.par;
              return (
                <div key={p.id} className="score-row card">
                  <div className="score-name">
                    <strong>{p.name}</strong>
                    <span className="muted">
                      {strokes > 0 ? `${'•'.repeat(strokes)} gets ${strokes}` : strokes < 0 ? `gives ${-strokes}` : ''}
                      {s != null && strokes !== 0 ? ` · net ${s - strokes}` : ''}
                    </span>
                  </div>
                  <div className="stepper">
                    <button
                      className="step"
                      onClick={() => setScore(p.id, s == null ? info.par - 1 : s - 1)}
                      aria-label={`${p.name} minus one`}
                    >
                      −
                    </button>
                    <button
                      className={`score-val ${diff == null ? 'empty' : diff < 0 ? 'under' : diff > 0 ? 'over' : 'par'}`}
                      onClick={() => s == null && setScore(p.id, info.par)}
                      aria-label={`${p.name} score`}
                    >
                      {s ?? 'Par?'}
                    </button>
                    <button
                      className="step"
                      onClick={() => setScore(p.id, s == null ? info.par + 1 : s + 1)}
                      aria-label={`${p.name} plus one`}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {nassau && (
            <PressPanel nassau={nassau} hole={hole} names={names} updateGame={updateGame} computed={computed} />
          )}

          <div className="sticky-bottom bottom-bar">
            <Totals players={round.players} totals={computed.totals} />
            {hole < last ? (
              <button className="btn btn-primary btn-xl" onClick={() => goTo(hole + 1)} disabled={!holeScored}>
                {holeScored ? (wolfMissing ? 'Next hole (no wolf pick)' : `Next: hole ${hole + 1}`) : 'Enter every score'}
              </button>
            ) : (
              <button className="btn btn-primary btn-xl" onClick={onSettle}>
                {computed.finished ? 'Finish & settle up' : `Settle up (thru ${computed.holesComplete})`}
              </button>
            )}
          </div>
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
