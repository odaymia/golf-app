import { useEffect, useState } from 'react';
import Feed from './Feed.jsx';
import NewPost from './NewPost.jsx';
import PostDetail from './PostDetail.jsx';
import PostList from './PostList.jsx';
import SavedPage, { FolderPage } from './SavedPage.jsx';
import Inbox from './Inbox.jsx';
import Thread from './Thread.jsx';
import Search from './Search.jsx';
import Notifications from './Notifications.jsx';
import FollowList from './FollowList.jsx';
import InstructorSetup from '../instructor/InstructorSetup.jsx';
import Studio from '../instructor/Studio.jsx';
import ProfilePage from './ProfilePage.jsx';
import CoursePage from './CoursePage.jsx';
import { getPublicProfile } from '../../lib/social.js';

// The social side of the app, with its own back stack.
// start: { name: 'feed' | 'new' | 'user', params }
export default function Social({ start, user, account, onTab, onSettings }) {
  // start.under puts a screen beneath it, so Back works (shared post links).
  const initial = (st) => (st.under ? [{ name: st.under, params: {} }, st] : [st]);
  const [stack, setStack] = useState(() => initial(start));
  const [ready, setReady] = useState(null); // has a username?

  useEffect(() => {
    setStack(initial(start));
  }, [start]);

  // Social needs a username first; the profile page asks for one.
  useEffect(() => {
    getPublicProfile(user.id)
      .then((p) => setReady(!!p?.username))
      .catch(() => setReady(true)); // offline: let screens show their own errors
  }, [user.id]);
  const onProfileSaved = (p) => setReady(!!p?.username);

  // New screens open at the top; going back returns to where you were.
  // (The post list scrolls itself to the tapped post.)
  const top = stack[stack.length - 1];
  useEffect(() => {
    if (top.name === 'posts') return;
    const y = top.scrollY ?? 0;
    window.scrollTo(0, y);
    if (!y) return;
    // The screen reloads its posts, so keep trying until it is tall enough.
    const timers = [100, 300, 600, 1000].map((ms) =>
      setTimeout(() => Math.abs(window.scrollY - y) > 2 && window.scrollTo(0, y), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [top]);

  // keep: params to remember on the current screen for when you come back.
  const nav = (name, params = {}, keep = null) => {
    if (name === 'new') return onTab('new');
    const scrollY = window.scrollY;
    setStack((s) => {
      const cur = s.at(-1);
      return [...s.slice(0, -1), { ...cur, scrollY, params: keep ? { ...cur.params, ...keep } : cur.params }, { name, params }];
    });
  };
  const back = stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : null;
  const meId = user.id;

  if (ready === null) return <div className="screen"><p className="muted center">Loading…</p></div>;
  if (!ready && !(top.name === 'user' && top.params.userId === meId)) {
    return (
      <ProfilePage
        userId={meId}
        meId={meId}
        account={account}
        nav={nav}
        back={() => onTab('golf')}
        onSettings={onSettings}
        onProfileSaved={onProfileSaved}
        key="setup"
      />
    );
  }

  switch (top.name) {
    case 'new':
      return <NewPost meId={meId} onPosted={() => onTab('feed')} onCancel={() => onTab('feed')} />;
    case 'user':
      return (
        <ProfilePage
          key={top.params.userId}
          userId={top.params.userId}
          meId={meId}
          account={account}
          nav={nav}
          back={back}
          onSettings={onSettings}
          onProfileSaved={onProfileSaved}
        />
      );
    case 'course':
      return <CoursePage course={top.params.course} meId={meId} nav={nav} back={back} />;
    case 'follows':
      return <FollowList key={top.params.userId} {...top.params} meId={meId} nav={nav} back={back ?? (() => onTab('me'))} />;
    case 'activity':
      return <Notifications meId={meId} nav={nav} back={back ?? (() => onTab('me'))} />;
    case 'teach':
      return <InstructorSetup meId={meId} back={back ?? (() => onTab('me'))} onSaved={() => (back ? back() : onTab('me'))} />;
    case 'studio':
      return <Studio meId={meId} nav={nav} back={back ?? (() => onTab('me'))} />;
    case 'search':
      return <Search meId={meId} nav={nav} back={back ?? (() => onTab('feed'))} initial={top.params} />;
    case 'saved':
      return <SavedPage meId={meId} nav={nav} back={back} />;
    case 'folder':
      return <FolderPage key={top.params.folderId} folderId={top.params.folderId} meId={meId} nav={nav} back={back} />;
    case 'inbox':
      return <Inbox meId={meId} nav={nav} back={back ?? (() => onTab('feed'))} />;
    case 'thread':
      return <Thread key={top.params.conversationId} {...top.params} meId={meId} nav={nav} back={back ?? (() => onTab('feed'))} />;
    case 'posts':
      return <PostList key={top.params.startId} {...top.params} meId={meId} nav={nav} back={back} />;
    case 'post':
      return <PostDetail key={top.params.postId} postId={top.params.postId} meId={meId} nav={nav} back={back} />;
    default:
      return <Feed meId={meId} nav={nav} />;
  }
}
