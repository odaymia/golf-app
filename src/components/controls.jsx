// Small shared form controls: switches, toggles, segmented and option pickers.
import { useState } from 'react';

// A whole-number box you can type in freely (clear it, type 12): the number
// is kept while typing whenever it's in range, and clamped to min..max when
// you leave the box or press Enter. Tapping it selects the number.
export function NumberField({ value, min, max, onChange, className, ...props }) {
  const [draft, setDraft] = useState(null);
  const clamp = (n) => Math.min(max, Math.max(min, n));
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    onChange(clamp(draft === '' || !Number.isFinite(n) ? value : n));
    setDraft(null);
  };
  return (
    <input
      {...props}
      className={className}
      inputMode="numeric"
      value={draft ?? String(value)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const text = e.target.value.replace(/\D/g, '').slice(0, String(max).length);
        setDraft(text);
        const n = Number(text);
        if (text !== '' && n >= min && n <= max) onChange(n);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <div className="toggle">
      <span>{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

// One-of-N segmented buttons. options: [[value, label], ...]
export function Seg({ value, options, onChange, wide = true }) {
  return (
    <div className={`seg ${wide ? 'wide' : ''}`}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// Big tappable cards with a title and a line of help. options: { value: { label, help } }
export function OptionCards({ value, options, onChange, only }) {
  const keys = only ?? Object.keys(options);
  return (
    <div className="stack">
      {keys.map((k) => (
        <button key={k} type="button" className={`option ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>
          {options[k].label}
          <span className="option-help">{options[k].help}</span>
        </button>
      ))}
    </div>
  );
}
