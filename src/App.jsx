import { useEffect, useState } from 'react';
import Home from './components/Home.jsx';
import Setup from './components/Setup.jsx';
import Play from './components/Play.jsx';
import Settle from './components/Settle.jsx';
import SignIn from './components/SignIn.jsx';
import Profile from './components/Profile.jsx';
import League from './components/League.jsx';
import LeagueBuilder from './components/LeagueBuilder.jsx';
import { createLeague } from './lib/leagueApi.js';
import { getRound, saveRound } from './lib/storage.js';
import { getSession, loadProfile, onAuthChange } from './lib/account.js';

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
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [profile, setProfile] = useState(undefined);
  const [profileError, setProfileError] = useState('');
  const [screen, setScreen] = useState('home');
  const [round, setRound] = useState(null);
  const [leagueId, setLeagueId] = useState(null);

  // Signed in? The session is kept on the phone, so this works offline.
  useEffect(() => {
    getSession().then(setSession);
    return onAuthChange(setSession);
  }, []);

  const user = session?.user;
  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      setProfile(undefined);
      return;
    }
    setProfileError('');
    loadProfile(user)
      .then(setProfile)
      .catch((e) => setProfileError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the account changes
  }, [userId]);

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

  if (session === undefined) return <div className="screen" />;
  if (!session) return <SignIn />;
  if (profileError && !profile)
    return (
      <div className="screen">
        <div className="card warn-box">{profileError}</div>
        <button className="btn btn-primary btn-xl" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (profile === undefined) return <div className="screen" />;
  if (!profile.name)
    return <Profile firstTime user={user} profile={profile} onSaved={setProfile} />;

  if (screen === 'league' && leagueId)
    return <League leagueId={leagueId} user={user} onBack={goHome} />;
  if (screen === 'newLeague')
    return (
      <LeagueBuilder
        onCancel={goHome}
        onSave={async ({ name, settings }) => {
          const id = await createLeague({ name, settings, profile });
          setLeagueId(id);
          setScreen('league');
        }}
      />
    );
  if (screen === 'profile')
    return <Profile user={user} profile={profile} onSaved={setProfile} onBack={goHome} />;
  if (screen === 'setup') return <Setup profile={profile} onStart={startRound} onCancel={goHome} />;
  if (screen === 'play' && round)
    return <Play round={round} setRound={setRound} onSettle={() => setScreen('settle')} onHome={goHome} />;
  if (screen === 'settle' && round)
    return <Settle round={round} setRound={setRound} onBack={() => setScreen('play')} onHome={goHome} />;
  return (
    <Home
      profile={profile}
      onProfile={() => setScreen('profile')}
      onNew={() => setScreen('setup')}
      onOpen={openRound}
      onOpenLeague={(id) => {
        setLeagueId(id);
        setScreen('league');
      }}
      onCreateLeague={() => setScreen('newLeague')}
    />
  );
}
