import { useEffect, useState } from 'react';
import Home from './components/Home.jsx';
import Setup from './components/Setup.jsx';
import Play from './components/Play.jsx';
import Settle from './components/Settle.jsx';
import SignIn from './components/SignIn.jsx';
import Profile from './components/Profile.jsx';
import League from './components/League.jsx';
import LeagueBuilder from './components/LeagueBuilder.jsx';
import { claimMyInvites, createLeague, joinLeague } from './lib/leagueApi.js';
import BottomNav from './components/BottomNav.jsx';
import Settings from './components/settings/Settings.jsx';
import { useUnreadNotifications } from './components/useUnreadNotifications.js';
import Social from './components/social/Social.jsx';
import { getRound, saveRound } from './lib/storage.js';
import { getSession, loadProfile, onAuthChange } from './lib/account.js';

// Where the player is, kept across reloads (an app update reloads the page)
// so they land back on the same round instead of the home screen.
const PLACE_KEY = 'golf-app:place';

// Shared post link (/app/?post=ID), read once when the app loads.
const LINKED_POST = (() => {
  const id = new URLSearchParams(location.search).get('post');
  if (!id) return null;
  history.replaceState(null, '', location.pathname);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
})();

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
  const [newKind, setNewKind] = useState('league');
  const [socialStart, setSocialStart] = useState({ name: 'feed', params: {} });
  const [joinError, setJoinError] = useState('');

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

  // Invite links (/app/?join=CODE): remember the code through sign-in.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('join');
    if (!code) return;
    try {
      sessionStorage.setItem('golf-app:join', code.toUpperCase());
    } catch {
      // storage blocked: the code is still in the URL this visit
    }
    history.replaceState(null, '', location.pathname);
  }, []);

  // Once signed in with a profile: link email invites, then follow an invite link.
  const ready = !!profile?.name;
  // Unread notifications, for the badge on the Profile tab.
  const unreadCount = useUnreadNotifications(ready ? userId : null);
  useEffect(() => {
    if (!ready) return;
    claimMyInvites().catch(() => {});
    let code = null;
    try {
      code = sessionStorage.getItem('golf-app:join');
      sessionStorage.removeItem('golf-app:join');
    } catch {
      // nothing saved
    }
    if (!code) return;
    joinLeague(code, profile)
      .then((id) => {
        setLeagueId(id);
        setScreen('league');
      })
      .catch((e) => setJoinError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per sign-in
  }, [ready]);

  // Shared post links (/app/?post=ID): open the post once signed in.
  const linkedPost = LINKED_POST;
  useEffect(() => {
    if (!ready || !linkedPost) return;
    setSocialStart({ name: 'post', params: { postId: linkedPost }, under: 'feed' });
    setScreen('social');
  }, [ready, linkedPost]);

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

  // Bottom tabs. A new object each tap resets that tab to its first screen.
  function onTab(tab) {
    if (tab === 'golf') return goHome();
    const name = tab === 'me' ? 'user' : tab === 'new' ? 'new' : 'feed';
    setSocialStart({ name, params: tab === 'me' ? { userId } : {} });
    setScreen('social');
  }
  const activeTab =
    screen === 'social' ? (socialStart.name === 'user' ? 'me' : socialStart.name === 'new' ? 'new' : 'feed') : 'golf';
  const withNav = (content) => (
    <>
      {content}
      <BottomNav active={activeTab} onTab={onTab} badges={{ me: unreadCount }} />
    </>
  );

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
        kind={newKind}
        onCancel={goHome}
        onSave={async ({ name, settings }) => {
          const id = await createLeague({ name, settings, profile });
          setLeagueId(id);
          setScreen('league');
        }}
      />
    );
  if (screen === 'social')
    return withNav(
      <Social start={socialStart} user={user} account={profile} onTab={onTab} onSettings={() => setScreen('profile')} />,
    );
  if (screen === 'profile')
    return (
      <Settings
        user={user}
        profile={profile}
        onSaved={setProfile}
        onBack={() => onTab('me')}
        onOpenSocial={(name) => {
          setSocialStart({ name, params: {}, under: 'feed' });
          setScreen('social');
        }}
      />
    );
  if (screen === 'setup') return <Setup profile={profile} meId={userId} onStart={startRound} onCancel={goHome} />;
  if (screen === 'play' && round)
    return <Play round={round} setRound={setRound} onSettle={() => setScreen('settle')} onHome={goHome} />;
  if (screen === 'settle' && round)
    return <Settle round={round} setRound={setRound} onBack={() => setScreen('play')} onHome={goHome} />;
  return withNav(
    <>
      {joinError && (
        <div className="screen join-error">
          <div className="card warn-box">
            {joinError}{' '}
            <button className="link" onClick={() => setJoinError('')}>
              OK
            </button>
          </div>
        </div>
      )}
      <Home
        profile={profile}
        onProfile={() => onTab('me')}
        onNew={() => setScreen('setup')}
        onOpen={openRound}
        onOpenLeague={(id) => {
          setLeagueId(id);
          setScreen('league');
        }}
        onCreateLeague={(kind) => {
          setNewKind(kind);
          setScreen('newLeague');
        }}
      />
    </>
  );
}
