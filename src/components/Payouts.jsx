import { computePayouts, normalizePayouts, ordinal, PAYOUT_PRESETS, purseCents } from '../lib/league/payouts.js';
import { formatMoney } from '../lib/games/money.js';
import { settle } from '../lib/games/settle.js';
import { Switch } from './controls.jsx';

// Commissioner: payouts by place. cfg from normalizePayouts; onChange(next).
// entrants: how many are playing (for the purse preview).
export function PayoutsEditor({ cfg, onChange, entrants = 0, title = 'Payouts by place' }) {
  const set = (patch) => onChange({ ...cfg, ...patch });
  const preset = PAYOUT_PRESETS.find((p) => p.places.join() === cfg.places.join());
  const total = cfg.places.reduce((s, x) => s + x, 0);
  const purse = purseCents(cfg, entrants);
  const fixed = cfg.purse !== '' && Number(cfg.purse) > 0;
  return (
    <div className={`game payouts-edit ${cfg.on ? 'on' : ''}`}>
      <div className="game-head">
        <strong>{title}</strong>
        <Switch label={title} checked={cfg.on} onChange={(on) => set({ on })} />
      </div>
      {cfg.on && (
        <div className="game-body">
          <p className="rules">Pay 1st, 2nd, 3rd… a share of the purse. Ties split the places they cover. Scribble never holds the money.</p>
          <div className="row2">
            <label className="field money">
              <span>Entry per player</span>
              <div className="money-input">
                <span>$</span>
                <input inputMode="decimal" value={cfg.entry} onChange={(e) => set({ entry: e.target.value })} disabled={fixed} />
              </div>
            </label>
            <label className="field money">
              <span>Or a fixed purse</span>
              <div className="money-input">
                <span>$</span>
                <input inputMode="decimal" placeholder="optional" value={cfg.purse} onChange={(e) => set({ purse: e.target.value })} />
              </div>
            </label>
          </div>
          <div className="chips payout-presets">
            {PAYOUT_PRESETS.map((p) => (
              <button key={p.key} className={`chip ${preset?.key === p.key ? 'on' : ''}`} onClick={() => set({ places: [...p.places] })}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="payout-places">
            {cfg.places.map((pct, i) => (
              <label key={i} className="payout-place">
                <span>{ordinal(i + 1)}</span>
                <input
                  inputMode="numeric"
                  value={pct}
                  aria-label={`${ordinal(i + 1)} place percent`}
                  onChange={(e) => set({ places: cfg.places.map((x, j) => (j === i ? Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) : x)) })}
                />
                <em>%</em>
                {entrants > 0 && total > 0 && <small>{formatMoney(Math.round((purse * pct) / total))}</small>}
              </label>
            ))}
            <div className="payout-place-actions">
              {cfg.places.length < 10 && (
                <button className="link small-link" onClick={() => set({ places: [...cfg.places, 0] })}>
                  + Place
                </button>
              )}
              {cfg.places.length > 1 && (
                <button className="link small-link" onClick={() => set({ places: cfg.places.slice(0, -1) })}>
                  − Place
                </button>
              )}
            </div>
          </div>
          <p className="hint">
            {total !== 100 && total > 0 ? `Shares add up to ${total}%; they're scaled so the whole purse is paid. ` : ''}
            {entrants > 0
              ? fixed
                ? `Purse ${formatMoney(purse)}.`
                : `${entrants} playing × ${formatMoney(Math.round(Number(cfg.entry) * 100) || 0)} = ${formatMoney(purse)} purse.`
              : 'The purse grows as players are added.'}
          </p>
        </div>
      )}
    </div>
  );
}

// Everyone: who's in the money. rows: [{ key, name, position }] best first.
// final: the round/tournament is over (else "if it ended now").
// people: settle-up only between individual players (not teams).
export function PayoutsBoard({ config, rows, final, people = true, meKey, title = 'Payouts' }) {
  const cfg = normalizePayouts(config);
  if (!cfg.on || !rows.length) return null;
  const r = computePayouts(cfg, rows);
  const name = (k) => rows.find((x) => x.key === k)?.name ?? '?';
  const paid = r.lines.filter((l) => l.cents > 0);
  let payments = [];
  if (r.balances && people) {
    try {
      payments = settle(r.balances);
    } catch {
      payments = [];
    }
  }
  return (
    <section className="card payouts">
      <h3>{title}</h3>
      <p className="muted small">
        Purse {formatMoney(r.purse)}
        {r.fromEntries ? ` · ${rows.length} × ${formatMoney(r.entry)} entry` : ' · fixed purse'} · {final ? 'Final' : 'If it ended now'}
      </p>
      {paid.length === 0 ? (
        <p className="muted">No one has finished in the money yet.</p>
      ) : (
        <ol className="payout-lines">
          {paid.map((l) => (
            <li key={l.key} className={l.key === meKey ? 'mine' : ''}>
              <span className="payout-pos">{l.tied ? `T${l.position}` : ordinal(l.place)}</span>
              <span className="payout-name">{name(l.key)}</span>
              <strong>{formatMoney(l.cents)}</strong>
            </li>
          ))}
        </ol>
      )}
      {payments.length > 0 && (
        <>
          <h3 className="pairings-sub">{final ? 'Settle up' : 'Settle up if it ended now'}</h3>
          <ul className="lines side-pay">
            {payments.map((p, i) => (
              <li key={i}>
                <strong>{name(p.from)}</strong> pays <strong>{name(p.to)}</strong> {formatMoney(p.cents)}
              </li>
            ))}
          </ul>
          <p className="hint">Everyone&apos;s entry is netted against what they win. Pay each other directly (cash, Venmo).</p>
        </>
      )}
      {r.fromEntries && !people && <p className="hint">Each team collects its entries and splits its winnings.</p>}
    </section>
  );
}
