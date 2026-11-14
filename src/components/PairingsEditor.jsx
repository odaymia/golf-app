import { useState } from 'react';
import {
  PAIRING_METHODS,
  normalizeTeeSheet,
  pairingOrder,
  makeGroups,
  makeSinglesMatches,
  makeTeamMatches,
  previousEvent,
  teeSheetRows,
  formatTime,
  myTeeTime,
} from '../lib/league/pairings.js';
import { MATCH_FORMATS } from '../lib/league/event.js';
import { Seg, Toggle } from './controls.jsx';

// Commissioner: how this round is paired (manual, random, last round,
// standings), group size, and tee times or a shotgun start.
export default function PairingsEditor({ data, event, computed, playable, roundFormat, busy, onSave, setError }) {
  const { settings } = computed;
  const members = data.members;
  const name = (id) => members.find((m) => m.id === id)?.name ?? '?';
  const groups = event.groups ?? [];
  const sheet = normalizeTeeSheet(event.teeSheet);
  const prev = previousEvent(data.events, event);
  const individual = settings.unit === 'individual';
  const matchPlay = settings.scoring === 'match';
  const canMakeMatches = matchPlay && settings.unit !== 'ryder';

  const [method, setMethod] = useState('random');
  const [direction, setDirection] = useState('leaders-last');
  const [size, setSize] = useState(4);
  const [withMatches, setWithMatches] = useState(canMakeMatches);
  const [building, setBuilding] = useState([]);

  const teamOf = individual ? null : (id) => members.find((m) => m.id === id)?.team || id;
  const ranked = method === 'last' || method === 'standings';

  async function generate() {
    if (!individual && playable.some((m) => !m.team)) {
      return setError(`Give every player a ${settings.unit === 'ryder' ? 'side' : 'team'} under Players first.`);
    }
    const replacing = groups.length || (withMatches && canMakeMatches && event.matchups.length);
    if (replacing && !confirm('Replace this round’s current pairings?')) return;
    const order = pairingOrder({
      method,
      direction,
      players: playable,
      settings,
      standings: computed.standings,
      lastBoard: prev ? computed.results[prev.id]?.board : null,
    });
    const patch = { teeSheet: { ...sheet, slots: [] } };
    let note = '';
    if (withMatches && canMakeMatches) {
      if (individual) {
        const { matchups, bye } = makeSinglesMatches(order);
        patch.matchups = matchups.map((mu) => ({ ...mu, format: roundFormat }));
        if (bye) note = `${name(bye)} has no opponent this round (odd number of players).`;
      } else {
        const teamOrder = [...new Set(order.map(teamOf))];
        const need = MATCH_FORMATS[roundFormat].size;
        const playersOf = (t) => order.filter((id) => teamOf(id) === t).slice(0, need);
        const { matchups, bye } = makeTeamMatches(teamOrder, playersOf, roundFormat);
        patch.matchups = matchups;
        if (bye) note = `${bye} has no opponent this round (odd number of teams).`;
      }
      // Each match plays together: groups follow the match order.
      const inMatches = patch.matchups.flatMap((mu) => mu.sides.flat());
      const rest = order.filter((id) => !inMatches.includes(id));
      const matchOf = (id) => {
        const i = patch.matchups.findIndex((mu) => mu.sides.flat().includes(id));
        return i < 0 ? `rest:${teamOf ? teamOf(id) : id}` : `match:${i}`;
      };
      patch.groups = makeGroups([...inMatches, ...rest], size, matchOf);
    } else {
      patch.groups = makeGroups(order, size, teamOf);
    }
    await onSave(patch);
    if (note) setError(note);
  }

  const setSheet = (change) => onSave({ teeSheet: { ...sheet, ...change } });
  const rows = teeSheetRows(event, { preview: true });
  const grouped = new Set(groups.flat());
  const free = playable.filter((m) => !grouped.has(m.id));

  return (
    <section className="card pairings">
      <h3>Pairings</h3>
      <p className="hint">Players can only enter scores for their own group, and everyone sees their tee time.</p>

      <div className="field">
        <span>How to pair this round</span>
        <Seg value={method} options={Object.entries(PAIRING_METHODS).map(([k, m]) => [k, m.short])} onChange={setMethod} />
      </div>
      {ranked && (
        <Seg
          value={direction}
          options={[
            ['leaders-last', 'Leaders tee off last'],
            ['leaders-first', 'Leaders tee off first'],
          ]}
          onChange={setDirection}
        />
      )}
      {method === 'last' && !prev && <p className="hint">This is the first round, so the season standings are used.</p>}
      {ranked && (
        <p className="hint">
          {direction === 'leaders-last'
            ? 'Last place goes in the first group and the leaders in the last group.'
            : 'The leaders go in the first group and last place in the last group.'}{' '}
          {individual ? '' : 'Teammates stay together.'}
        </p>
      )}

      {method !== 'manual' && (
        <>
          <div className="field">
            <span>Group size</span>
            <Seg
              value={size}
              options={[
                [4, 'Foursomes'],
                [3, 'Threesomes'],
                [2, 'Twosomes'],
              ]}
              onChange={setSize}
            />
          </div>
          {canMakeMatches && (
            <Toggle
              label={individual ? 'Also set the matches (neighbours play each other)' : 'Also set the team matches'}
              checked={withMatches}
              onChange={setWithMatches}
            />
          )}
          <button className="btn btn-primary full" disabled={busy || playable.length < 2} onClick={generate}>
            {method === 'random' && groups.length ? 'Redraw pairings' : 'Make pairings'}
          </button>
        </>
      )}

      <h3 className="pairings-sub">Tee times</h3>
      <Seg
        value={sheet.mode}
        options={[
          ['tee', 'Tee times'],
          ['shotgun', 'Shotgun start'],
        ]}
        onChange={(mode) => setSheet({ mode, slots: [] })}
      />
      <div className="row2">
        <label className="field">
          <span>{sheet.mode === 'shotgun' ? 'Shotgun at' : 'First tee time'}</span>
          <input type="time" value={sheet.start} onChange={(e) => e.target.value && setSheet({ start: e.target.value, slots: [] })} />
        </label>
        {sheet.mode === 'tee' && (
          <label className="field">
            <span>Minutes apart</span>
            <select value={sheet.interval} onChange={(e) => setSheet({ interval: Number(e.target.value), slots: [] })}>
              {[7, 8, 9, 10, 11, 12, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="muted">No groups yet.</p>
      ) : (
        <ul className="lines tee-lines">
          {rows.map((r) => (
            <li key={r.index} className="match-line">
              <SlotInput
                mode={sheet.mode}
                value={r.slot}
                onChange={(v) => {
                  const slots = rows.map((x) => sheet.slots[x.index] || '');
                  slots[r.index] = v;
                  setSheet({ slots });
                }}
              />
              <span className="tee-names">
                <strong>Group {r.index + 1}:</strong> {r.ids.map(name).join(', ')}
              </span>
              {groups.length > 0 && (
                <button
                  className="btn btn-ghost btn-small"
                  disabled={busy}
                  onClick={() =>
                    onSave({ groups: groups.filter((_, j) => j !== r.index), teeSheet: { ...sheet, slots: sheet.slots.filter((_, j) => j !== r.index) } })
                  }
                  aria-label={`Remove group ${r.index + 1}`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {groups.length === 0 && rows.length > 0 && <p className="hint">Each match plays as its own group.</p>}

      {free.length > 0 && (method === 'manual' || groups.length > 0) && (
        <>
          <p className="hint">{groups.length ? 'Not in a group yet:' : 'Tap up to four players, then add the group.'}</p>
          <div className="chips">
            {free.map((m) => (
              <button
                key={m.id}
                className={`chip ${building.includes(m.id) ? 'on' : ''}`}
                onClick={() => setBuilding((b) => (b.includes(m.id) ? b.filter((x) => x !== m.id) : b.length < 4 ? [...b, m.id] : b))}
              >
                {m.name}
              </button>
            ))}
          </div>
          <button
            className="btn btn-ghost full"
            disabled={busy || building.length === 0}
            onClick={() => {
              onSave({ groups: [...groups, building], teeSheet: sheet });
              setBuilding([]);
            }}
          >
            Add group
          </button>
        </>
      )}
    </section>
  );
}

// Tee time (time picker) or shotgun hole (short text like "1B").
function SlotInput({ mode, value, onChange }) {
  const [draft, setDraft] = useState(null);
  if (mode === 'tee') {
    return (
      <input className="tee-slot" type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Tee time" />
    );
  }
  return (
    <input
      className="tee-slot hole"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value.toUpperCase().slice(0, 3))}
      onBlur={() => {
        if (draft != null && draft.trim() && draft !== value) onChange(draft.trim());
        setDraft(null);
      }}
      aria-label="Starting hole"
    />
  );
}

// Everyone: the round's tee sheet.
export function TeeSheet({ event, members, meId }) {
  const rows = teeSheetRows(event);
  if (!rows.length) return null;
  const sheet = normalizeTeeSheet(event.teeSheet);
  const name = (id) => members.find((m) => m.id === id)?.name ?? '?';
  return (
    <section className="card">
      <h3>{sheet.mode === 'shotgun' ? `Shotgun start · ${formatTime(sheet.start)}` : 'Tee times'}</h3>
      <ul className="lines tee-lines">
        {rows.map((r) => (
          <li key={r.index} className={r.ids.includes(meId) ? 'mine' : ''}>
            <strong className="tee-time">{sheet.mode === 'shotgun' ? `Hole ${r.slot}` : formatTime(r.slot)}</strong>
            <span className="tee-names">{r.ids.map(name).join(', ')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// A player's own tee time, shown at the top of the round.
export function MyTeeTime({ event, members, meId }) {
  const mine = meId ? myTeeTime(event, meId) : null;
  if (!mine?.label) return null;
  const others = mine.ids.filter((id) => id !== meId).map((id) => members.find((m) => m.id === id)?.name ?? '?');
  return (
    <div className="my-tee">
      <span>Your tee time</span>
      <strong>{mine.label}</strong>
      {others.length > 0 && <em>with {others.join(', ')}</em>}
    </div>
  );
}
