import { useMemo, useState } from 'react';
import { computeRound } from '../lib/games/round.js';
import { formatMoney } from '../lib/games/money.js';
import { Payments, Totals } from './MoneyView.jsx';
import { gameTitle, nameMap } from './gameSummary.js';
import { saveRound } from '../lib/storage.js';
import { casualRecapFacts } from '../lib/roundRecap.js';
import { RoundRecap, PlayerRecaps, RateCourse } from './RoundRecap.jsx';

export default function Settle({ round, setRound, onBack, onHome }) {
  const computed = useMemo(() => computeRound(round), [round]);
  const [copied, setCopied] = useState(false);
  const names = nameMap(round.players);
  const final = round.status === 'final';
  const facts = useMemo(() => (computed.finished ? casualRecapFacts(round, computed, gameTitle) : null), [round, computed]);

  function summaryText() {
    const lines = [`${round.course.name} – ${new Date(round.createdAt).toLocaleDateString()}`];
    if (!computed.finished) lines.push(`(thru ${computed.holesComplete} holes)`);
    for (const g of computed.games) {
      lines.push(
        `${gameTitle(g.game)}: ` +
          round.players.map((p) => `${p.name} ${formatMoney(g.balances[p.id], { signed: true })}`).join(', '),
      );
    }
    lines.push('');
    if (!computed.payments.length) lines.push('All square.');
    for (const p of computed.payments) lines.push(`${names[p.from]} pays ${names[p.to]} ${formatMoney(p.cents)}`);
    return lines.join('\n');
  }

  async function share() {
    const text = summaryText();
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      // user cancelled the share sheet
    }
  }

  async function finish() {
    // Save before leaving: going home clears the round from state.
    const finished = { ...round, status: 'final' };
    await saveRound(finished).catch((e) => console.error('Save failed', e));
    setRound(finished);
    onHome();
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          ‹ Scores
        </button>
        <h1>Settle up</h1>
        <span />
      </div>

      {!computed.finished && (
        <div className="card warn-box">
          Only {computed.holesComplete} of {round.course.holes.length} holes have every score. These numbers are
          where things stand right now.
        </div>
      )}

      {facts && <RoundRecap facts={facts} recap={round.recap} onRecap={(recap) => setRound((r) => ({ ...r, recap }))} />}
      {facts && (
        <PlayerRecaps
          facts={facts}
          saved={round.playerRecaps}
          onSaved={(name, text) => setRound((r) => ({ ...r, playerRecaps: { ...r.playerRecaps, [name]: text } }))}
        />
      )}

      <section className="card settle-card">
        <h2>Who pays who</h2>
        <Payments players={round.players} payments={computed.payments} />
        <p className="hint center">
          Fewest payments to square everyone up. The app never moves money — pay each other however you like.
        </p>
      </section>

      <Totals players={round.players} totals={computed.totals} />

      <section className="card">
        <h3>By game</h3>
        <table className="by-game">
          <thead>
            <tr>
              <th />
              {round.players.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {computed.games.map((g) => (
              <tr key={g.game.id}>
                <td>{gameTitle(g.game)}</td>
                {round.players.map((p) => (
                  <td key={p.id} className={g.balances[p.id] > 0 ? 'up' : g.balances[p.id] < 0 ? 'down' : ''}>
                    {formatMoney(g.balances[p.id], { signed: true })}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="total-row">
              <td>Total</td>
              {round.players.map((p) => (
                <td key={p.id}>{formatMoney(computed.totals[p.id], { signed: true })}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      {computed.finished && (
        <RateCourse course={{ key: round.course.id, name: round.course.name }} rated={round.rated} onRated={() => setRound((r) => ({ ...r, rated: true }))} />
      )}

      <div className="stack">
        <button className="btn btn-ghost btn-xl" onClick={share}>
          {copied ? 'Copied!' : 'Share results'}
        </button>
        {!final && (
          <button className="btn btn-primary btn-xl" onClick={finish}>
            Mark round final
          </button>
        )}
        {final && (
          <button className="btn btn-primary btn-xl" onClick={onHome}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}
