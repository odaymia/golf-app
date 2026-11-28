// Shared score entry pieces: hole bar, hole dots, score box and the keypad
// fixed at the bottom. Typing logic lives in useKeypad.js.

export function HoleBar({ hole, count, info, tee, course, onGo }) {
  return (
    <div className="gg-holebar">
      <button className="gg-nav" onClick={() => onGo(Math.max(1, hole - 1))} disabled={hole === 1} aria-label="Previous hole">
        {hole > 1 ? `‹ Hole ${hole - 1}` : ''}
      </button>
      <div className="gg-hole">
        <strong>Hole {hole}</strong>
        {course && <em className="gg-course">{course}</em>}
        <span>
          Par {info.par} · Hcp {info.hcp}
          {tee ? ` · ${tee} tees` : ''}
        </span>
      </div>
      <button className="gg-nav right" onClick={() => onGo(Math.min(count, hole + 1))} disabled={hole === count} aria-label="Next hole">
        {hole < count ? `Hole ${hole + 1} ›` : ''}
      </button>
    </div>
  );
}

// done(i) / bad(i): hole i is fully scored / has a problem.
export function HoleDots({ count, hole, done, bad = () => false, onGo }) {
  return (
    <div className="hole-dots slim grid" style={{ gridTemplateColumns: `repeat(${Math.min(count, 9)}, 1fr)` }}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          className={`dot ${done(i) ? 'done' : ''} ${i === hole - 1 ? 'here' : ''} ${bad(i) ? 'disc' : ''}`}
          onClick={() => onGo(i + 1)}
          aria-label={`Hole ${i + 1}`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

// Scroll the score box being typed into so the keypad doesn't cover it.
function keepAboveKeypad(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    const kp = document.querySelector('.keypad');
    if (!kp) return;
    const box = el.getBoundingClientRect();
    const top = kp.getBoundingClientRect().top;
    if (box.bottom > top - 8) window.scrollBy({ top: box.bottom - top + 16, behavior: 'smooth' });
  });
}

// One score box: tap to type into it with the keypad.
export function ScoreBox({ value, par, strokes = 0, active, unconfirmed = false, label, onClick, readOnly = false }) {
  const diff = value == null ? null : value - par;
  return (
    <button
      className={`gg-score ${diff == null ? 'empty' : diff < 0 ? 'under' : diff > 0 ? 'over' : 'par'} ${unconfirmed ? 'unconfirmed' : ''} ${active ? 'active' : ''}`}
      onClick={onClick}
      disabled={readOnly}
      aria-label={label}
      aria-pressed={active}
      ref={active ? keepAboveKeypad : undefined}
    >
      {value ?? (active ? '' : '–')}
      {active && <span className="caret" />}
      {strokes > 0 && <i className="gg-dots">{'•'.repeat(strokes)}</i>}
    </button>
  );
}

// The keypad (only while a score box is selected). kp: from useKeypad.
export function Keypad({ kp, onUndo, onSave, saveLabel = 'Save scores' }) {
  if (!kp.open) return null;
  return (
    <>
      <div className="keypad-space" />
      <div className="keypad" role="group" aria-label="Score keypad">
        {kp.typed === '1' && (
          <p className="keypad-hint" role="status">
            10 or more? Tap 0–5 now for 10–15. A hole-in-one? Tap the next player.
          </p>
        )}
        <div className="keypad-keys">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} onClick={() => kp.press(d)}>
              {d}
            </button>
          ))}
          <button className="kp-word" onClick={kp.clear}>
            Clear
          </button>
          <button onClick={() => kp.press(0)} disabled={kp.typed !== '1'}>
            0
          </button>
          <button className="kp-word" onClick={kp.close} aria-label="Close keypad">
            ✕
          </button>
        </div>
        <div className="keypad-actions">
          <button className="kp-undo" onClick={onUndo}>
            Undo changes
          </button>
          <button className="kp-save" onClick={onSave}>
            {saveLabel}
          </button>
        </div>
      </div>
    </>
  );
}
