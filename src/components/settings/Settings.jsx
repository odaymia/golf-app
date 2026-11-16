import { useEffect, useState } from 'react';
import { signOut } from '../../lib/account.js';
import { DEFAULT_PRIVACY, getPrivacy, savePrivacy } from '../../lib/social.js';
import { clearRecent } from '../../lib/searchHistory.js';
import Profile, { BlockedAccounts, DeleteAccount, SavedPlayers } from '../Profile.jsx';
import { Switch } from '../controls.jsx';

// The settings menu (☰ on your profile): sections of rows like other social
// apps; each row opens its own page.
export default function Settings({ user, profile, onSaved, onBack, onOpenSocial }) {
  const [page, setPage] = useState('menu');
  const [privacy, setPrivacy] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    getPrivacy(user.id)
      .then(setPrivacy)
      .catch(() => setPrivacy({ ...DEFAULT_PRIVACY, unavailable: true }));
  }, [user.id]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  // Save one setting right away; undo the switch if it fails.
  async function change(patch) {
    const before = privacy;
    setPrivacy((p) => ({ ...p, ...patch }));
    setError('');
    try {
      await savePrivacy(user.id, patch);
    } catch (e) {
      setPrivacy(before);
      setError(e.message);
    }
  }

  const back = () => {
    setError('');
    setPage('menu');
  };

  if (page === 'golf')
    return <Profile user={user} profile={profile} onSaved={onSaved} onBack={back} golfOnly />;
  if (page !== 'menu') {
    const titles = {
      privacy: 'Account privacy',
      messages: 'Messages',
      comments: 'Comments',
      likes: 'Likes',
      handicap: 'Handicap index',
      notifications: 'Notifications',
      blocked: 'Blocked accounts',
      players: 'My players',
      delete: 'Delete account',
    };
    return (
      <div className="screen settings">
        <div className="topbar">
          <button className="btn btn-ghost" onClick={back}>
            ‹ Settings
          </button>
          <h1>{titles[page]}</h1>
          <span />
        </div>
        {error && <div className="card error-box">{error}</div>}
        {privacy?.unavailable && ['privacy', 'messages', 'comments', 'likes', 'notifications', 'handicap'].includes(page) && (
          <div className="card warn-box">These settings aren&apos;t available yet. Try again later.</div>
        )}
        {privacy && <SettingsPage page={page} privacy={privacy} change={change} user={user} />}
      </div>
    );
  }

  const label = {
    everyone: 'Everyone',
    following: 'People you follow',
    followers: 'Your followers',
    none: 'No one',
  };

  return (
    <div className="screen settings">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          ‹ Back
        </button>
        <h1>Settings</h1>
        <span />
      </div>

      <Group title="How others see you">
        <Row icon="🔒" label="Account privacy" value={privacy ? (privacy.isPrivate ? 'Private' : 'Public') : ''} onClick={() => setPage('privacy')} />
        <Row icon="💬" label="Messages" value={privacy ? label[privacy.allowMessages] : ''} onClick={() => setPage('messages')} />
        <Row icon="🗨️" label="Comments" value={privacy ? label[privacy.allowComments] : ''} onClick={() => setPage('comments')} />
        <Row icon="⛳" label="Handicap index" value={privacy ? (privacy.shareHandicap ? 'Shared' : 'Hidden') : ''} onClick={() => setPage('handicap')} />
        <Row icon="♡" label="Likes" value={privacy ? (privacy.hideLikeCounts ? 'Counts hidden' : 'Counts shown') : ''} onClick={() => setPage('likes')} />
        <Row icon="⛔" label="Blocked accounts" onClick={() => setPage('blocked')} />
      </Group>

      <Group title="Notifications">
        <Row icon="🔔" label="Notifications" value={privacy ? notifySummary(privacy.notify) : ''} onClick={() => setPage('notifications')} />
      </Group>

      <Group title="Golf">
        <Row icon="⛳" label="Golf profile" value="Name, handicap, home course" onClick={() => setPage('golf')} />
        <Row icon="👥" label="My players" value="People you play with" onClick={() => setPage('players')} />
      </Group>

      <Group title="Your activity">
        <Row icon="🔖" label="Saved" onClick={() => onOpenSocial('saved')} />
        <Row
          icon="🕘"
          label="Clear search history"
          onClick={() => {
            if (!confirm('Clear your search history?')) return;
            clearRecent(user.id);
            setNote('Search history cleared.');
          }}
        />
      </Group>

      <Group title="Support and about">
        <Row icon="✉️" label="Report a problem" href="mailto:support@scribblegolfclub.com?subject=Problem%20in%20Scribble%20Golf%20Club" />
        <Row icon="📄" label="Terms of use" href="https://scribblegolfclub.com/terms/" />
        <Row icon="🛡️" label="Privacy policy" href="https://scribblegolfclub.com/privacy/" />
      </Group>

      <Group title="Account">
        <p className="settings-signed-in muted small">Signed in as {user.email}</p>
        <Row icon="↪" label="Sign out" onClick={() => confirm('Sign out of Scribble Golf Club?') && signOut()} />
        <Row icon="🗑" label="Delete account" danger onClick={() => setPage('delete')} />
      </Group>
      {note && <p className="share-status">{note}</p>}
      <p className="muted small center settings-version">Scribble Golf Club</p>
    </div>
  );
}

function notifySummary(n) {
  const on = Object.values(n).filter(Boolean).length;
  return on === Object.keys(n).length ? 'All on' : on === 0 ? 'All off' : `${on} of ${Object.keys(n).length} on`;
}

function Group({ title, children }) {
  return (
    <section className="settings-group">
      <h3>{title}</h3>
      <div className="settings-list">{children}</div>
    </section>
  );
}

function Row({ icon, label, value, onClick, href, danger }) {
  const inner = (
    <>
      <span className="settings-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="settings-label">{label}</span>
      {value && <span className="settings-value">{value}</span>}
      <span className="settings-chev" aria-hidden="true">
        ›
      </span>
    </>
  );
  return href ? (
    <a className={`settings-row ${danger ? 'danger' : ''}`} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
      {inner}
    </a>
  ) : (
    <button className={`settings-row ${danger ? 'danger' : ''}`} onClick={onClick}>
      {inner}
    </button>
  );
}

function Choice({ value, options, onChange, disabled }) {
  return (
    <div className="settings-list">
      {options.map(([v, label, help]) => (
        <button key={v} className="settings-row choice" onClick={() => onChange(v)} disabled={disabled} aria-pressed={value === v}>
          <span className="settings-label">
            {label}
            {help && <em>{help}</em>}
          </span>
          <i className={`pick-dot ${value === v ? 'on' : ''}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, help, checked, onChange, disabled }) {
  return (
    <div className="settings-row toggle-row">
      <span className="settings-label">
        {label}
        {help && <em>{help}</em>}
      </span>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

function SettingsPage({ page, privacy, change, user }) {
  const off = !!privacy.unavailable;
  switch (page) {
    case 'privacy':
      return (
        <section className="settings-group">
          <div className="settings-list">
            <Toggle label="Private account" checked={privacy.isPrivate} disabled={off} onChange={(v) => change({ isPrivate: v })} />
          </div>
          <p className="settings-help">
            {privacy.isPrivate
              ? 'Only followers you approve can see your photos and videos. New followers send a request you can confirm or delete in Notifications. Your profile name, photo and bio are still visible.'
              : 'Anyone on Scribble can see your photos and videos. Turn this on to approve who follows you.'}
          </p>
          {privacy.isPrivate && (
            <p className="settings-help">Switching back to public automatically accepts everyone who has asked to follow you.</p>
          )}
        </section>
      );
    case 'messages':
      return (
        <section className="settings-group">
          <h3>Who can send you new messages</h3>
          <Choice
            value={privacy.allowMessages}
            disabled={off}
            onChange={(v) => change({ allowMessages: v })}
            options={[
              ['everyone', 'Everyone'],
              ['following', 'Only people you follow'],
              ['none', 'No one', 'You can still message others.'],
            ]}
          />
          <p className="settings-help">Blocked accounts can never message you.</p>
          <div className="settings-list settings-gap">
            <Toggle
              label="Read receipts"
              help="Let people see when you’ve read their messages."
              checked={privacy.readReceipts}
              disabled={off}
              onChange={(v) => change({ readReceipts: v })}
            />
          </div>
          <p className="settings-help">
            {privacy.readReceipts
              ? 'People see “Seen” once you’ve read their messages.'
              : 'People won’t see when you’ve read their messages, and you won’t see when they’ve read yours.'}
          </p>
        </section>
      );
    case 'comments':
      return (
        <section className="settings-group">
          <h3>Who can comment on your posts</h3>
          <Choice
            value={privacy.allowComments}
            disabled={off}
            onChange={(v) => change({ allowComments: v })}
            options={[
              ['everyone', 'Everyone'],
              ['followers', 'Your followers'],
              ['none', 'No one', 'Turns comments off on all your posts.'],
            ]}
          />
        </section>
      );
    case 'likes':
      return (
        <section className="settings-group">
          <div className="settings-list">
            <Toggle
              label="Hide like counts"
              help="Others won’t see how many likes your posts get. You still will."
              checked={privacy.hideLikeCounts}
              disabled={off}
              onChange={(v) => change({ hideLikeCounts: v })}
            />
          </div>
        </section>
      );
    case 'handicap':
      return (
        <section className="settings-group">
          <div className="settings-list">
            <Toggle
              label="Share my handicap index"
              checked={privacy.shareHandicap}
              disabled={off}
              onChange={(v) => change({ shareHandicap: v })}
            />
          </div>
          <p className="settings-help">
            {privacy.shareHandicap
              ? 'When a friend adds you to a round, your handicap index fills in automatically. Your GHIN number is never shared.'
              : 'Friends adding you to a round will type your index themselves.'}
          </p>
        </section>
      );
    case 'notifications': {
      const set = (k) => (v) => change({ notify: { ...privacy.notify, [k]: v } });
      return (
        <section className="settings-group">
          <h3>Tell me when someone…</h3>
          <div className="settings-list">
            <Toggle label="Likes my post" checked={privacy.notify.like} disabled={off} onChange={set('like')} />
            <Toggle label="Comments on my post" checked={privacy.notify.comment} disabled={off} onChange={set('comment')} />
            <Toggle label="Follows me or accepts my request" checked={privacy.notify.follow} disabled={off} onChange={set('follow')} />
            <Toggle label="Sends me a message" checked={privacy.notify.message} disabled={off} onChange={set('message')} />
            <Toggle label="Swing reviews" help="Instructors and their subscribers" checked={privacy.notify.review} disabled={off} onChange={set('review')} />
          </div>
          <p className="settings-help">Follow requests always show up, so you can answer them. Unread messages also show on the Messages button.</p>
        </section>
      );
    }
    case 'blocked':
      return <BlockedAccounts meId={user.id} />;
    case 'players':
      return <SavedPlayers />;
    case 'delete':
      return <DeleteAccount userId={user.id} />;
    default:
      return null;
  }
}
