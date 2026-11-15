// Bottom tab bar: Golf (rounds, leagues), Feed, + (new post), Profile.
const TABS = [
  ['golf', 'Golf', 'M12 3v14M12 3l6 3-6 3M7 20h10'],
  ['feed', 'Feed', 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5'],
  ['new', 'Post', 'M12 5v14M5 12h14'],
  ['me', 'Profile', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4.5-6 8-6s7 2 8 6'],
];

export default function BottomNav({ active, onTab, badges = {} }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map(([key, label, d]) => (
        <button
          key={key}
          className={`bn-tab ${active === key ? 'on' : ''} ${key === 'new' ? 'bn-new' : ''}`}
          onClick={() => onTab(key)}
          aria-label={key === 'new' ? 'New post' : label}
          aria-current={active === key ? 'page' : undefined}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {key !== 'new' && <span>{label}</span>}
          {badges[key] > 0 && <i className="bn-badge" aria-label={`${badges[key]} new`}>{badges[key] > 99 ? '99+' : badges[key]}</i>}
        </button>
      ))}
    </nav>
  );
}
