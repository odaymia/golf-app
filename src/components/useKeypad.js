import { useState } from 'react';

// Typing scores with the keypad (shared by every score entry screen).
// const keypad = useKeypad(hole);  ...later...  const kp = keypad(keys, setScore);
// keys: one per row on this hole, in order; setScore(key, value|null).
// Tapping a score box focuses it; a digit enters it and moves to the next
// row; a 1 waits for 0–5 to make 10–15; the last row keeps the cursor.
export function useKeypad(hole) {
  const [cursor, setCursor] = useState(null); // { hole, key, typed }
  return (keys, setScore) => {
    const here = cursor && cursor.hole === hole ? cursor : null;
    const activeKey = here && keys.includes(here.key) ? here.key : null;
    const typed = here?.typed ?? '';
    const idx = keys.indexOf(activeKey);
    const focus = (key, t = '') => setCursor({ hole, key, typed: t });
    const next = () => keys[Math.min(idx + 1, keys.length - 1)] ?? null;
    return {
      activeKey,
      typed,
      open: activeKey != null,
      focus,
      close: () => setCursor(null),
      press(d) {
        if (activeKey == null) return;
        if (typed === '1' && d <= 5) {
          setScore(activeKey, 10 + d);
          return focus(next());
        }
        if (d === 0) return;
        setScore(activeKey, d);
        if (d === 1) return focus(activeKey, '1');
        focus(next());
      },
      clear() {
        if (activeKey == null) return;
        setScore(activeKey, null);
        focus(activeKey);
      },
    };
  };
}
