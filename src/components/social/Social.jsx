import { useEffect, useState } from 'react';
import Feed from './Feed.jsx';
import NewPost from './NewPost.jsx';
import PostDetail from './PostDetail.jsx';
import ProfilePage from './ProfilePage.jsx';
import CoursePage from './CoursePage.jsx';
import { getPublicProfile } from '../../lib/social.js';

// The social side of the app, with its own back stack.
// start: { name: 'feed' | 'new' | 'user', params }
export default function Social({ start, user, account, onTab, onSettings }) {
  const [stack, setStack] = useState([start]);
  const [ready, setReady] = useState(null); // has a username?

  useEffect(() => {
    setStack([start]);
  }, [start]);

  // Social needs a username first; the profile page asks for one.
  useEffect(() => {
    getPublicProfile(user.id)
      .then((p) => setReady(!!p?.username))
      .catch(() => setReady(true)); // offline: let screens show their own errors
  }, [user.id]);
  const onProfileSaved = (p) => setReady(!!p?.username);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stack]);

  const top = stack[stack.length - 1];
  const nav = (name, params = {}) => {
    if (name === 'new') return onTab('new');
    setStack((s) => [...s, { name, params }]);
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
    case 'post':
      return <PostDetail key={top.params.postId} postId={top.params.postId} meId={meId} nav={nav} back={back} />;
    default:
      return <Feed meId={meId} nav={nav} />;
  }
}
