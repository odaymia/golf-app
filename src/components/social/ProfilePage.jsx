import { useCallback, useEffect, useRef, useState } from 'react';
import { startDM } from '../../lib/messages.js';
import { getInstructor } from '../../lib/instructors.js';
import InstructorCard from '../instructor/InstructorCard.jsx';
import { useUnreadNotifications } from '../useUnreadNotifications.js';
import {
  blockStatus,
  blockUser,
  unblockUser,
  follow,
  getPublicProfile,
  listUserPosts,
  profileStats,
  savePublicProfile,
  unfollow,
  uploadAvatar,
} from '../../lib/social.js';
import { cleanUsername, compactCount, suggestUsername, usernameProblem } from '../../lib/socialFormat.js';
import Avatar from './Avatar.jsx';
import HomeCoursePicker from '../HomeCoursePicker.jsx';
import PostGrid from './PostGrid.jsx';

// Instagram-style profile: photo, counts, bio, follow, and the post grid.
// Your own profile also edits itself, and links to Settings.
export default function ProfilePage({ userId, meId, account, nav, back, onSettings, onProfileSaved }) {
  const mine = userId === meId;
  const [profile, setProfile] = useState(undefined);
  const [stats, setStats] = useState(null);
  const [posts, setPosts] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [blocks, setBlocks] = useState({ iBlocked: false, blockedMe: false });
  const [teach, setTeach] = useState(null); // { instructor, tiers } if they teach
  const unread = useUnreadNotifications(mine ? meId : null);
  const lockedPrivate = !mine && profile?.isPrivate && stats && stats.followState !== 'following';

  const load = useCallback(async () => {
    setError('');
    try {
      getInstructor(userId).then(setTeach).catch(() => setTeach(null));
      const [p, s, list, b] = await Promise.all([
        getPublicProfile(userId),
        profileStats(userId, meId),
        listUserPosts(userId, meId),
        mine ? Promise.resolve({ iBlocked: false, blockedMe: false }) : blockStatus(meId, userId),
      ]);
      setBlocks(b);
      setProfile(p);
      setStats(s);
      setPosts(list);
      if (mine && !p?.username) setEditing(true);
    } catch (e) {
      setError(e.message);
      setProfile(null);
    }
  }, [userId, meId, mine]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleFollow() {
    const state = stats.followState;
    if (state === 'following' && profile?.isPrivate && !confirm(`Unfollow @${profile.username}? You'll need to ask again to see their posts.`)) return;
    try {
      if (state === 'none') {
        const next = await follow(userId);
        setStats((s) => ({ ...s, followState: next, iFollow: next === 'following', followers: s.followers + (next === 'following' ? 1 : 0) }));
        if (next === 'following' && profile?.isPrivate) load();
      } else {
        await unfollow(meId, userId);
        setStats((s) => ({ ...s, followState: 'none', iFollow: false, followers: s.followers - (state === 'following' ? 1 : 0) }));
        if (profile?.isPrivate) load();
      }
    } catch (e) {
      setError(e.message);
      load();
    }
  }

  async function toggleBlock() {
    try {
      if (blocks.iBlocked) {
        await unblockUser(meId, userId);
      } else {
        if (!confirm('Block this golfer? You won’t see each other’s posts or comments, and any follows are removed.')) return;
        await blockUser(userId);
      }
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (editing) {
    return (
      <EditProfile
        meId={meId}
        profile={profile}
        account={account}
        firstTime={!profile?.username}
        onSaved={(p) => {
          setProfile(p);
          setEditing(false);
          onProfileSaved?.(p);
          load();
        }}
        onCancel={profile?.username ? () => setEditing(false) : back}
      />
    );
  }

  async function message() {
    try {
      const id = await startDM(userId);
      nav('thread', { conversationId: id, peer: profile });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        {back ? (
          <button className="btn btn-ghost" onClick={back}>
            ‹ Back
          </button>
        ) : (
          <span />
        )}
        <h1>
          {profile?.isPrivate && <span className="lock-mark" aria-label="Private account">🔒 </span>}
          {profile?.username ? `@${profile.username}` : 'Profile'}
        </h1>
        {mine ? (
          <span className="topbar-actions">
            <button className="bell-btn" onClick={() => nav('activity')} aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}>
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
              {unread > 0 && <span className="inbox-badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
            <button className="bell-btn" onClick={onSettings} aria-label="Settings">
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ) : (
          <span />
        )}
      </div>
      {error && <div className="card warn-box">{error}</div>}
      {profile === undefined && <p className="muted center">Loading…</p>}
      {profile === null && !error && <p className="muted center">This golfer hasn&apos;t set up a profile yet.</p>}
      {profile && !mine && blocks.blockedMe && !blocks.iBlocked && (
        <p className="muted center">This profile isn&apos;t available.</p>
      )}
      {profile && !mine && blocks.iBlocked && (
        <section className="card center">
          <p>
            You blocked <strong>@{profile.username}</strong>.
          </p>
          <button className="btn btn-ghost outline" onClick={toggleBlock}>
            Unblock
          </button>
        </section>
      )}
      {profile && (mine || (!blocks.iBlocked && !blocks.blockedMe)) && (
        <>
          <section className="profile-head">
            <Avatar profile={profile} size={86} />
            <div className="profile-counts">
              <div>
                <strong>{compactCount(stats?.posts ?? 0)}</strong>
                <span>Posts</span>
              </div>
              <div>
                <strong>{compactCount(stats?.followers ?? 0)}</strong>
                <span>Followers</span>
              </div>
              <div>
                <strong>{compactCount(stats?.following ?? 0)}</strong>
                <span>Following</span>
              </div>
            </div>
          </section>
          <section className="profile-bio">
            <strong>{profile.displayName}</strong>
            {profile.homeCourse &&
              (profile.homeCourseKey ? (
                <button
                  className="link home-course-link"
                  onClick={() =>
                    nav('course', { course: { key: profile.homeCourseKey, name: profile.homeCourse, place: profile.homeCoursePlace } })
                  }
                >
                  ⛳ {profile.homeCourse}
                </button>
              ) : (
                <span className="muted">⛳ {profile.homeCourse}</span>
              ))}
            {profile.bio && <p>{profile.bio}</p>}
          </section>
          {teach && teach.instructor.active && (
            <InstructorCard data={teach} userId={userId} meId={meId} mine={mine} nav={nav} />
          )}
          {mine && teach && !teach.instructor.active && (
            <button className="link center-link" onClick={() => nav('teach')}>
              Your instructor page is paused · Edit
            </button>
          )}
          <div className="profile-buttons">
            {mine ? (
              <>
                <button className="btn btn-ghost full outline" onClick={() => setEditing(true)}>
                  Edit profile
                </button>
                <button className="btn btn-ghost full outline" onClick={() => nav('saved')}>
                  Saved
                </button>
              </>
            ) : (
              <>
                <button
                  className={`btn full ${stats && stats.followState !== 'none' ? 'btn-ghost outline' : 'btn-primary'}`}
                  onClick={toggleFollow}
                  disabled={!stats}
                >
                  {stats?.followState === 'following' ? 'Following' : stats?.followState === 'pending' ? 'Requested' : 'Follow'}
                </button>
                <button className="btn btn-ghost full outline" onClick={message}>
                  Message
                </button>
                <button className="btn btn-ghost outline block-btn" onClick={toggleBlock} aria-label="Block">
                  Block
                </button>
              </>
            )}
          </div>
          {lockedPrivate ? (
            <section className="private-note">
              <span aria-hidden="true">🔒</span>
              <strong>This account is private</strong>
              <p className="muted">
                {stats?.followState === 'pending'
                  ? 'Follow request sent. You’ll see their photos and videos once they accept.'
                  : 'Follow this account to see their photos and videos.'}
              </p>
            </section>
          ) : posts === null ? (
            <p className="muted center">Loading…</p>
          ) : (
            <PostGrid
              posts={posts}
              onOpen={(p) => nav('posts', { posts, startId: p.id, title: profile?.username ? `@${profile.username}` : 'Posts' })}
              empty={mine ? 'Share your first round: tap + below.' : 'No posts yet.'}
            />
          )}
          {mine && !teach && (
            <button className="teach-cta" onClick={() => nav('teach')}>
              <strong>Teach golf?</strong> Get paid for tips and swing reviews · Set up an instructor page ›
            </button>
          )}
        </>
      )}
    </div>
  );
}

function EditProfile({ meId, profile, account, firstTime, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({
    displayName: profile?.displayName || account?.name || '',
    username: profile?.username || suggestUsername(account?.name),
    bio: profile?.bio ?? '',
    home: profile?.homeCourse
      ? { name: profile.homeCourse, key: profile.homeCourseKey, place: profile.homeCoursePlace }
      : account?.homeCourse
        ? { name: account.homeCourse, key: account.homeCourseKey ?? null, place: '' }
        : null,
    avatarPath: profile?.avatarPath ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function pickAvatar(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const path = await uploadAvatar(meId, file);
      setForm((f) => ({ ...f, avatarPath: path, avatarUrl: URL.createObjectURL(file) }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const username = cleanUsername(form.username);
    const problem = usernameProblem(username);
    if (problem) return setError(problem);
    if (!form.displayName.trim()) return setError('Add your name.');
    setBusy(true);
    setError('');
    try {
      onSaved(
        await savePublicProfile(meId, {
          ...form,
          username,
          homeCourse: form.home?.name ?? '',
          homeCourseKey: form.home?.key ?? null,
          homeCoursePlace: form.home?.place ?? '',
        }),
      );
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          {firstTime ? '‹ Back' : 'Cancel'}
        </button>
        <h1>{firstTime ? 'Your golf profile' : 'Edit profile'}</h1>
        <span />
      </div>
      {firstTime && (
        <p className="muted center">Pick a username so other golfers can find you, follow you and see your posts.</p>
      )}
      <section className="card">
        <div className="avatar-edit">
          <Avatar profile={{ avatarUrl: form.avatarUrl, displayName: form.displayName }} size={86} />
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickAvatar(e.target.files[0])} />
          <button className="btn btn-ghost" onClick={() => fileInput.current.click()} disabled={busy}>
            {form.avatarUrl ? 'Change photo' : 'Add a photo'}
          </button>
        </div>
        <label className="field">
          <span>Name</span>
          <input value={form.displayName} onChange={(e) => set('displayName', e.target.value)} />
        </label>
        <label className="field">
          <span>Username</span>
          <div className="username-input">
            <span>@</span>
            <input
              value={form.username}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => set('username', cleanUsername(e.target.value).slice(0, 24))}
            />
          </div>
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea
            className="caption-input"
            rows={3}
            maxLength={300}
            value={form.bio}
            placeholder="Weekend hacker. Chasing single digits."
            onChange={(e) => set('bio', e.target.value)}
          />
        </label>
        <div className="field">
          <span>Home course</span>
          <HomeCoursePicker value={form.home} onChange={(home) => set('home', home)} disabled={busy} />
        </div>
        <p className="hint">Everyone in Scribble can see your profile and posts. Your handicap index and GHIN number stay private.</p>
        {error && <p className="search-error">{error}</p>}
        <button className="btn btn-primary btn-xl" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : firstTime ? 'Create profile' : 'Save'}
        </button>
      </section>
    </div>
  );
}
