import { useState } from 'react';

// A row that opens and closes from its heading (home screen "Your golf"
// card). Remembers open/closed on this phone per `id`; shows a count.
export default function Dropdown({ id, title, icon = null, count = null, defaultOpen = false, children }) {
  const key = `scribble:open:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? '0' : '1');
      } catch {
        // storage blocked: still toggles this visit
      }
      return !o;
    });
  return (
    <div className={`dropdown ${open ? 'open' : ''}`}>
      <button className="dropdown-head" onClick={toggle} aria-expanded={open}>
        {icon && (
          <span className="dropdown-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="dropdown-title">{title}</span>
        {count != null && <span className="dropdown-count">{count}</span>}
        <span className="dropdown-chev" aria-hidden="true">
          ›
        </span>
      </button>
      {open && <div className="dropdown-body">{children}</div>}
    </div>
  );
}
