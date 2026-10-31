import { formatMoney } from '../lib/games/money.js';
import { gameLines, gameTitle, nameMap } from './gameSummary.js';

export function Totals({ players, totals }) {
  return (
    <div className="totals">
      {players.map((p) => (
        <div key={p.id} className={`total ${totals[p.id] > 0 ? 'up' : totals[p.id] < 0 ? 'down' : ''}`}>
          <span className="total-name">{p.name}</span>
          <span className="total-amt">{formatMoney(totals[p.id], { signed: true })}</span>
        </div>
      ))}
    </div>
  );
}

export function Payments({ players, payments }) {
  const names = nameMap(players);
  if (!payments.length) return <p className="muted center">All square. Nobody owes anything.</p>;
  return (
    <ul className="payments">
      {payments.map((p, i) => (
        <li key={i}>
          <strong>{names[p.from]}</strong> pays <strong>{names[p.to]}</strong>
          <span className="pay-amt">{formatMoney(p.cents)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function MoneyView({ round, computed }) {
  const { players } = round;
  return (
    <div>
      <Totals players={players} totals={computed.totals} />
      {computed.games.map((g) => (
        <section key={g.game.id} className="card">
          <div className="game-money-head">
            <h3>{gameTitle(g.game)}</h3>
            <span className="muted">{g.game.net ? 'Net' : 'Gross'}</span>
          </div>
          <ul className="lines">
            {gameLines(g, players).map((l, i) => (
              <li key={i} className={`${l.sub ? 'sub' : ''} ${l.head ? 'head' : ''}`}>
                {l.text}
              </li>
            ))}
          </ul>
          <div className="mini-totals">
            {players.map((p) => (
              <span key={p.id} className={g.balances[p.id] > 0 ? 'up' : g.balances[p.id] < 0 ? 'down' : ''}>
                {p.name} {formatMoney(g.balances[p.id], { signed: true })}
              </span>
            ))}
          </div>
        </section>
      ))}
      <section className="card">
        <h3>If we stopped now</h3>
        <Payments players={players} payments={computed.payments} />
      </section>
    </div>
  );
}
