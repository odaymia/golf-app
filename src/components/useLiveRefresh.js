import { useEffect } from 'react';

// While a round is open, pull everyone's latest scores every 20 seconds so
// the board moves live. Paused when the screen isn't visible.
export function useLiveRefresh(live, reload) {
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) reload({ quiet: true });
    };
    const id = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [live, reload]);
}
