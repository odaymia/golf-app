import { useEffect, useState } from 'react';

// True on laptop/desktop-width screens, where commissioners get the full console.
export function useWide(minWidth = 1024) {
  const query = `(min-width: ${minWidth}px)`;
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}
