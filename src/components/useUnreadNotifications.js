import { useEffect, useState } from 'react';
import { NOTIFICATIONS_CHANGED, unreadNotifications } from '../lib/notifications.js';

// Unread notification count, refreshed every 30 s, when the app comes back
// to the foreground, and whenever notifications are read. Pass null to skip.
export function useUnreadNotifications(userId) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const check = () => unreadNotifications(userId).then((n) => live && setCount(n)).catch(() => {});
    check();
    const t = setInterval(check, 30000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    window.addEventListener(NOTIFICATIONS_CHANGED, check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener(NOTIFICATIONS_CHANGED, check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);
  return userId ? count : 0;
}
