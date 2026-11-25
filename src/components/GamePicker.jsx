import {
  gameAvailable,
  GAME_INFO,
  teamOptions,
  usesTeams,
  gameLimitText,
} from '../lib/roundSetup.js';
import { Switch, Toggle } from './controls.jsx';
import StablefordScoring from './StablefordScoring.jsx';
import SplitEditor from './SplitEditor.jsx';
import { PlacesPicker } from './Payouts.jsx';
import { defaultSplit } from '../lib/league/ryder.js';

// Casual split match: best ball, then combined, then singles.
const splitDefault = (n) => defaultSplit(n).map((x, i) => ({ ...x, format: ['fourball', 'shamble', 'singles'][i] ?? 'singles' }));

// The games list (+ Teams for 2 vs 2 games), shared by casual round setup
// and foursome side games in league/tournament rounds.
// settings: roundSetup defaultSettings() shape; players: [{ id, name }].
// holeCount: holes these games cover (Nassau needs all 18).
export default function GamePicker({ settings, setSettings, players, holeCount = 18, allowSplit = true }) {
  const named = players;
  const teams = teamOptions(named);
  const showTeams = teams.length > 0 && usesTeams(settings, players.length);
  const setGame = (type, field, value) => setSettings((s) => ({ ...s, [type]: { ...s[type], [field]: value } }));
  return (
    <>
      <section className="card">
        <h2>Games</h2>
        {Object.keys(GAME_INFO).map((type) => {
          const available = gameAvailable(type, players.length) && (type !== 'nassau' || holeCount === 18);
          const s = settings[type];
          return (
            <div key={type} className={`game ${s.on && available ? 'on' : ''} ${available ? '' : 'disabled'}`}>
              <div className="game-head">
                <div>
                  <strong>{GAME_INFO[type].name}</strong>
                  {!available && <span className="muted"> · {type === 'nassau' && holeCount !== 18 ? 'needs all 18 holes' : gameLimitText(type)}</span>}
                </div>
                <Switch
                  label={`Play ${GAME_INFO[type].name}`}
                  checked={s.on && available}
                  disabled={!available}
                  onChange={(v) => setGame(type, 'on', v)}
                />
              </div>
              {s.on && available && (
                <div className="game-body">
                  <p className="rules">{GAME_INFO[type].rules}</p>
                  <GameOptions type={type} s={s} set={(f, v) => setGame(type, f, v)} playerCount={players.length} holeCount={holeCount} allowSplit={allowSplit} />
                </div>
              )}
            </div>
          );
        })}
      </section>

      {showTeams && (
        <section className="card">
          <h2>Teams</h2>
          <p className="hint">Who plays together in your 2 vs 2 games.</p>
          <div className="stack">
            {teams.map(([a, b], i) => (
              <button
                key={i}
                className={`option ${settings.teamsIndex === i ? 'on' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, teamsIndex: i }))}
              >
                {names(named, a)} <em>vs</em> {names(named, b)}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function names(players, ids) {
  return ids.map((id) => players.find((p) => p.id === id)?.name).join(' & ');
}

function GameOptions({ type, s, set, playerCount, holeCount = 18, allowSplit = true }) {
  const stakeLabel = {
    nassau: 'Per match (front / back / 18)',
    skins: s.mode === 'pot' ? 'Buy-in per player' : 'Per skin, from each player',
    match: 'Per match',
    stroke: s.mode === 'places' ? 'Entry per player' : s.mode === 'perStroke' ? 'Per stroke' : 'Per player you beat',
    stableford:
      s.mode === 'places' && !(s.format === 'teams' && playerCount === 4)
        ? 'Entry per player'
        : s.mode === 'perPoint'
          ? 'Per point'
          : s.format === 'teams' && playerCount === 4
            ? 'Per player, to the winning team'
            : 'Per player you beat',
    wolf: 'Per hole',
    vegas: 'Per point',
  }[type];
  // Paying by place (stroke play, or Stableford every player for themselves).
  const byPlace = s.mode === 'places' && (type === 'stroke' || (type === 'stableford' && !(s.format === 'teams' && playerCount === 4)));
  return (
    <div className="options">
      <label className="field money">
        <span>{stakeLabel}</span>
        <div className="money-input">
          <span>$</span>
          {type === 'skins' && s.mode === 'pot' ? (
            <input inputMode="decimal" value={s.buyIn} onChange={(e) => set('buyIn', e.target.value)} />
          ) : (
            <input inputMode="decimal" value={s.stake} onChange={(e) => set('stake', e.target.value)} />
          )}
        </div>
      </label>
      {type === 'skins' && (
        <div className="seg wide">
          <button className={s.mode !== 'pot' ? 'on' : ''} onClick={() => set('mode', 'perSkin')}>
            Pay per skin
          </button>
          <button className={s.mode === 'pot' ? 'on' : ''} onClick={() => set('mode', 'pot')}>
            Pot (buy-in)
          </button>
        </div>
      )}
      {type === 'skins' && s.mode === 'pot' && (
        <p className="hint">Everyone puts in the buy-in; the pot is split by skins won. Good for big groups.</p>
      )}
      <div className="seg wide">
        <button className={s.net ? 'on' : ''} onClick={() => set('net', true)}>
          Net
        </button>
        <button className={!s.net ? 'on' : ''} onClick={() => set('net', false)}>
          Gross
        </button>
      </div>
      {(type === 'nassau' || type === 'match') && playerCount === 4 && (
        <div className="seg wide">
          <button className={s.format === 'teams' ? 'on' : ''} onClick={() => set('format', 'teams')}>
            2 vs 2 teams
          </button>
          <button className={s.format === 'each' ? 'on' : ''} onClick={() => set('format', 'each')}>
            Everyone vs everyone
          </button>
        </div>
      )}
      {type === 'match' && allowSplit && playerCount === 4 && s.format === 'teams' && (
        <>
          <Toggle
            label="Split the round (different formats over different holes)"
            checked={!!s.split}
            onChange={(v) => set('split', v ? splitDefault(holeCount) : null)}
          />
          {s.split && (
            <SplitEditor
              segs={s.split}
              n={holeCount}
              formats={['fourball', 'shamble', 'singles']}
              hint={`Each stretch is its own $${s.stake || 0} match. A singles stretch is two matches: first player on each team vs each other, and second vs second.`}
              onChange={(next) => set('split', next)}
            />
          )}
        </>
      )}
      {type === 'nassau' && (
        <label className="field">
          <span>Auto press</span>
          <select value={s.autoPress} onChange={(e) => set('autoPress', Number(e.target.value))}>
            <option value={0}>Off (manual presses only)</option>
            <option value={2}>When 2 down</option>
            <option value={3}>When 3 down</option>
          </select>
        </label>
      )}
      {type === 'skins' && (
        <>
          <Toggle label="Carryovers" checked={s.carryover} onChange={(v) => set('carryover', v)} />
          <Toggle
            label="Validate (winner must tie or win the next hole)"
            checked={s.validate}
            onChange={(v) => set('validate', v)}
          />
        </>
      )}
      {type === 'stroke' && (
        <div className="seg wide">
          <button className={s.mode === 'perOpponent' ? 'on' : ''} onClick={() => set('mode', 'perOpponent')}>
            Per player beaten
          </button>
          <button className={s.mode === 'perStroke' ? 'on' : ''} onClick={() => set('mode', 'perStroke')}>
            Per stroke
          </button>
          <button className={s.mode === 'places' ? 'on' : ''} onClick={() => {
                set('mode', 'places');
                if ((Number(s.stake) || 0) < 5) set('stake', 20); // an entry, not a per-point bet
              }}>
            By place
          </button>
        </div>
      )}
      {type === 'stableford' && (
        <>
          {playerCount === 4 && (
            <div className="seg wide">
              <button className={s.format === 'each' ? 'on' : ''} onClick={() => set('format', 'each')}>
                Every player
              </button>
              <button className={s.format === 'teams' ? 'on' : ''} onClick={() => set('format', 'teams')}>
                2 vs 2 teams
              </button>
            </div>
          )}
          {s.format === 'teams' && playerCount === 4 && (
            <>
              <div className="seg wide">
                <button className={s.teamScore === 'bestBall' ? 'on' : ''} onClick={() => set('teamScore', 'bestBall')}>
                  Best ball
                </button>
                <button className={s.teamScore === 'aggregate' ? 'on' : ''} onClick={() => set('teamScore', 'aggregate')}>
                  Both balls count
                </button>
              </div>
              <p className="hint">Pick the teams under Teams, below the games.</p>
            </>
          )}
          <div className="seg wide">
            <button className={s.mode === 'perPoint' ? 'on' : ''} onClick={() => set('mode', 'perPoint')}>
              Per point
            </button>
            <button className={s.mode === 'perOpponent' ? 'on' : ''} onClick={() => set('mode', 'perOpponent')}>
              {s.format === 'teams' && playerCount === 4 ? 'Winner takes stake' : 'Per player beaten'}
            </button>
            {!(s.format === 'teams' && playerCount === 4) && (
              <button className={s.mode === 'places' ? 'on' : ''} onClick={() => {
                set('mode', 'places');
                if ((Number(s.stake) || 0) < 5) set('stake', 20); // an entry, not a per-point bet
              }}>
                By place
              </button>
            )}
          </div>
          <StablefordScoring value={s.scoring} net={s.net} onChange={(v) => set('scoring', v)} />
        </>
      )}
      {byPlace && (
        <>
          <PlacesPicker places={s.places ?? [50, 30, 20]} onChange={(next) => set('places', next)} purse={Math.round((Number(s.stake) || 0) * 100) * playerCount} />
          <p className="hint">
            Everyone puts in ${Number(s.stake) || 0}: {playerCount} × ${Number(s.stake) || 0} = ${(Number(s.stake) || 0) * playerCount} pot, paid by place.{' '}
            {type === 'stroke' ? 'Lowest total wins.' : 'Most points wins.'} Ties split the places they cover.
          </p>
        </>
      )}
      {type === 'wolf' && (
        <p className="hint">Wolf order is the player order above. Lone wolf 2×, blind wolf 3×.</p>
      )}
      {type === 'vegas' && (
        <Toggle label="Birdie flips the other team" checked={s.birdieFlip} onChange={(v) => set('birdieFlip', v)} />
      )}
    </div>
  );
}
