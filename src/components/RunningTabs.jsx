import { useCallback, useEffect, useState } from 'react';
import Dropdown from './Dropdown.jsx';
import { formatMoney } from '../lib/games/money.js';
import { parsePaid, tabSummary, tabText, towardMe } from '../lib/tab.js';
import { addToTab, loadTab, markPaid, sourcesAdded, tabChanged, undoPaid } from '../lib/moneyTab.js';

// My running tabs (lib/tab.js), refreshed when one changes anywhere.
export function useTabs(me) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    if (!me) return;
    loadTab(me)
      .then((rows) => {
        setEntries(rows);
        setError('');
      })
      .catch((e) => {
        setError(e.message);
        setEntries((x) => x ?? []);
      });
  }, [me]);
  useEffect(() => {
    reload();
    window.addEventListener('scribble:tab-changed', reload);
    return () => window.removeEventListener('scribble:tab-changed', reload);
  }, [reload]);
  return { tabs: entries ? tabSummary(entries, me) : null, error, reload };
}

const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });

// Home: "Running tabs" dropdown. Tap a friend for the history and, when they
// owe you, Mark paid (all or part). Only the person getting paid marks it.
export default function RunningTabs({ me, myName }) {
  const { tabs, error, reload } = useTabs(me);
  const [open, setOpen] = useState(null);
  if (!tabs?.length) return null; // nothing yet (or not set up): stay out of the way
  const owedToMe = tabs.reduce((s, t) => s + Math.max(0, t.cents), 0);
  return (
    <Dropdown id="tabs" title="Running tabs" count={tabs.filter((t) => t.cents !== 0).length}>
      {error && <p className="hg-empty">{error}</p>}
      {owedToMe > 0 && <p className="hg-empty">Owed to you: {formatMoney(owedToMe)}</p>}
      {tabs.map((t) => (
        <div key={t.userId} className="tab-item">
          <button className="hg-item" onClick={() => setOpen(open === t.userId ? null : t.userId)} aria-expanded={open === t.userId}>
            <span className="hg-item-text">
              <strong>{t.name}</strong>
              <span>
                {t.entries.filter((e) => e.kind === 'round').length} rounds · last {day(t.entries[0].created_at)}
              </span>
            </span>
            <span className={`tab-amount ${t.cents > 0 ? 'plus' : t.cents < 0 ? 'minus' : ''}`}>
              {t.cents === 0 ? 'Square' : formatMoney(t.cents, { signed: true })}
            </span>
          </button>
          {open === t.userId && <TabDetail tab={t} me={me} myName={myName} onChanged={reload} />}
        </div>
      ))}
    </Dropdown>
  );
}

function TabDetail({ tab, me, myName, onChanged }) {
  const [amount, setAmount] = useState(() => (tab.cents > 0 ? (tab.cents / 100).toFixed(2).replace(/\.00$/, '') : ''));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const first = tab.name.split(' ')[0];

  async function pay() {
    const cents = parsePaid(amount, tab.cents);
    if (cents == null) return setMsg(`Enter an amount up to ${formatMoney(tab.cents)}.`);
    if (!confirm(`Mark ${formatMoney(cents)} from ${first} as paid?`)) return;
    setBusy(true);
    setMsg('');
    try {
      await markPaid(tab.userId, cents, tab.name, myName);
      tabChanged();
      onChanged();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function undo(id) {
    if (!confirm('Take back this payment? It goes back on the tab.')) return;
    try {
      await undoPaid(id);
      tabChanged();
      onChanged();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="tab-detail">
      <p className="tab-headline">{tabText(tab, formatMoney)}</p>
      {tab.cents > 0 && (
        <div className="tab-pay">
          <label className="field">
            <span>Got paid</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`Amount ${first} paid`} />
          </label>
          <button className="btn btn-primary" disabled={busy} onClick={pay}>
            {busy ? 'Saving…' : 'Mark paid'}
          </button>
        </div>
      )}
      {tab.cents < 0 && <p className="hint">When you pay {first}, {first} marks it paid here.</p>}
      {msg && <p className="search-error">{msg}</p>}
      <ul className="tab-history">
        {tab.entries.map((e) => {
          const v = towardMe(e, me);
          return (
            <li key={e.id}>
              <span className="grow">
                <strong>{e.kind === 'paid' ? (e.to_user === me ? `${first} paid you` : `You paid ${first}`) : e.label || 'Round'}</strong>
                {e.kind === 'paid' && <span className="muted small"> · {day(e.created_at)}</span>}
                {e.kind === 'paid' && e.to_user === me && (
                  <button className="link small-link" onClick={() => undo(e.id)}>
                    Undo
                  </button>
                )}
              </span>
              <span className={v > 0 ? 'plus' : 'minus'}>{formatMoney(v, { signed: true })}</span>
            </li>
          );
        })}
      </ul>
      <p className="hint">Scribble keeps the tab; you pay each other however you like.</p>
    </div>
  );
}

// Settle screens: "Add to running tab" for a round (or each side-games set).
// items: [{ source, label, rows }] (rows from tabRows; null = someone has no
// account, so it can't go on a tab). me: my account; shows my new totals.
export function AddToTab({ items, me }) {
  const usable = items.filter((x) => x.rows?.length);
  const sourceKey = usable.map((x) => x.source).join('|');
  const [added, setAdded] = useState(null); // Set of sources on the tab
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const { tabs } = useTabs(added?.size ? me : null);

  useEffect(() => {
    if (!sourceKey) return;
    sourcesAdded(sourceKey.split('|'))
      .then(setAdded)
      .catch(() => setAdded(new Set()));
  }, [sourceKey]);

  if (!usable.length) return null;
  const todo = usable.filter((x) => !added?.has(x.source));
  const people = new Set(usable.flatMap((x) => x.rows.flatMap((r) => [r.from_user, r.to_user])).filter((id) => id !== me));

  async function add() {
    setBusy(true);
    setMsg('');
    try {
      for (const x of todo) await addToTab(x.source, x.label, x.rows);
      setAdded(new Set(usable.map((x) => x.source)));
      tabChanged();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card add-tab">
      {added === null ? null : todo.length ? (
        <>
          <button className="btn btn-ghost outline full" disabled={busy} onClick={add}>
            {busy ? 'Adding…' : '+ Add to running tab'}
          </button>
          <p className="hint">
            Keep a running total with these players across rounds instead of paying every round. Whoever’s owed marks it paid
            when you cash out (Home → Running tabs).
          </p>
        </>
      ) : (
        <>
          <p className="tab-on">✓ On the running tab</p>
          {tabs
            ?.filter((t) => people.has(t.userId))
            .map((t) => (
              <p key={t.userId} className="hint">
                Overall: {tabText(t, formatMoney)}
              </p>
            ))}
        </>
      )}
      {msg && <p className="search-error">{msg}</p>}
    </section>
  );
}
