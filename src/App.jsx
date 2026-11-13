import { useEffect, useState } from 'react';
import Home from './components/Home.jsx';
import Setup from './components/Setup.jsx';
import Play from './components/Play.jsx';
import Settle from './components/Settle.jsx';
import { getRound, saveRound } from './lib/storage.js';

// Where the player is, kept across reloads (an app update reloads the page)
// so they land back on the same round instead of the home screen.
const PLACE_KEY = 'golf-app:place';

function readPlace() {
  try {
    return JSON.parse(sessionStorage.getItem(PLACE_KEY));
  } catch {
    return null;
  }
}

function writePlace(place) {
  try {
    if (place) sessionStorage.setItem(PLACE_KEY, JSON.stringify(place));
    else sessionStorage.removeItem(PLACE_KEY);
  } catch {
    // storage blocked: nothing to restore later, which is fine
  }
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [round, setRound] = useState(null);

  // Every change to the round is written to the device right away.
  useEffect(() => {
    if (round) saveRound(round).catch((e) => console.error('Save failed', e));
  }, [round]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => {
    const place = readPlace();
    if (!place?.roundId) return;
    getRound(place.roundId)
      .then((r) => {
        if (!r) return;
        setRound(r);
        setScreen(place.screen === 'settle' ? 'settle' : 'play');
      })
      .catch(() => {});
  }, []);

  const roundId = round?.id;
  useEffect(() => {
    writePlace(roundId && (screen === 'play' || screen === 'settle') ? { roundId, screen } : null);
  }, [roundId, screen]);

  async function openRound(id) {
    const r = await getRound(id);
    if (!r) return;
    setRound(r);
    setScreen(r.status === 'final' ? 'settle' : 'play');
  }

  function startRound(r) {
    setRound(r);
    setScreen('play');
  }

  function goHome() {
    setRound(null);
    setScreen('home');
  }

  if (screen === 'setup') return <Setup onStart={startRound} onCancel={goHome} />;
  if (screen === 'play' && round)
    return <Play round={round} setRound={setRound} onSettle={() => setScreen('settle')} onHome={goHome} />;
  if (screen === 'settle' && round)
    return <Settle round={round} setRound={setRound} onBack={() => setScreen('play')} onHome={goHome} />;
  return <Home onNew={() => setScreen('setup')} onOpen={openRound} />;
}
