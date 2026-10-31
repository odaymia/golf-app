import { useEffect, useState } from 'react';
import Home from './components/Home.jsx';
import Setup from './components/Setup.jsx';
import Play from './components/Play.jsx';
import Settle from './components/Settle.jsx';
import { getRound, saveRound } from './lib/storage.js';

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
