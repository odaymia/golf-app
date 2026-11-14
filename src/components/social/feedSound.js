import { useSyncExternalStore } from 'react';

// Sound is one setting for every video (like Instagram): videos start muted,
// a tap turns sound on for this and every following video until tapped off.
let soundOn = false;
const listeners = new Set();
export function setSound(on) {
  soundOn = on;
  listeners.forEach((l) => l());
}
export const toggleSound = () => setSound(!soundOn);
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
export const useSound = () => useSyncExternalStore(subscribe, () => soundOn);
