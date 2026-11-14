// Small shared form controls: switches, toggles, segmented and option pickers.

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
