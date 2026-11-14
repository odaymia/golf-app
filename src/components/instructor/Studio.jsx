import { useCallback, useEffect, useState } from 'react';
import { answerReview, getInstructor, giveComp, listInterest, listReviewsForInstructor, listSubscribers, removeComp } from '../../lib/instructors.js';
import { searchProfiles } from '../../lib/social.js';
import { formatPrice, monthlyEarnings, PLATFORM_FEE_BPS } from '../../lib/instructor/fees.js';
import { PAYMENTS_LIVE } from '../../lib/instructor/payments.js';
import { timeAgo } from '../../lib/socialFormat.js';
import Avatar from '../social/Avatar.jsx';

// The instructor's dashboard: earnings, subscribers, people waiting for
// subscriptions to open, and swing reviews to answer.
export default function Studio({ meId, nav, back }) {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [inst, subs, interest, reviews] = await Promise.all([getInstructor(meId), listSubscribers(meId), listInterest(meId), listReviewsForInstructor(meId)]);
      setData({ inst, subs, interest, reviews });
      setError('');
    } catch (e) {
      setError(e.message);
      setData((d) => d ?? { inst: null, subs: [], interest: [], reviews: [] });
    }
  }, [meId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <div className="screen"><p className="muted center">Loading…</p></div>;
  const tiers = data.inst?.tiers ?? [];
  const tierName = (id) => tiers.find((t) => t.id === id)?.name ?? 'No tier';
  const liveSubs = data.subs.filter((s) => s.live);
  const open = data.reviews.filter((r) => r.status === 'open');

  return (
    <div className="screen studio">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={back}>
          ‹ Back
        </button>
        <h1>Instructor studio</h1>
        <button className="btn btn-ghost" onClick={() => nav('teach')}>
          Edit
        </button>
      </div>
      {!data.inst && <div className="card warn-box">Set up your instructor page first.</div>}
      {error && <div className="card warn-box">{error}</div>}
      <div className="tabs wide-tabs" role="tablist">
        {[
          ['overview', 'Overview'],
          ['subscribers', `Subscribers (${liveSubs.length})`],
          ['reviews', `Reviews${open.length ? ` (${open.length})` : ''}`],
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview data={data} tiers={tiers} go={setTab} nav={nav} />}
      {tab === 'subscribers' && <Subscribers meId={meId} data={data} tiers={tiers} tierName={tierName} reload={load} />}
      {tab === 'reviews' && <Reviews reviews={data.reviews} reload={load} />}
    </div>
  );
}

function Overview({ data, tiers, go, nav }) {
  const e = monthlyEarnings(
    data.subs.map((s) => ({ status: s.live ? 'active' : 'canceled', source: s.source, tierId: s.tierId })),
    tiers,
  );
  const comps = data.subs.filter((s) => s.live && s.source === 'comp').length;
  const open = data.reviews.filter((r) => r.status === 'open').length;
  // What the people waiting would pay if they all subscribed at the tier they picked.
  const hasAccess = new Set(data.subs.filter((s) => s.live).map((s) => s.subscriberId));
  const list = data.interest.filter((i) => !hasAccess.has(i.userId));
  const waiting = list.reduce((sum, i) => sum + (tiers.find((t) => t.id === i.tierId)?.priceCents ?? 0), 0);
  return (
    <>
      {!PAYMENTS_LIVE && (
        <div className="card notice">
          Paid subscriptions open soon. Golfers who tap Subscribe now join your waiting list, and you can give anyone free access to test
          your content.
        </div>
      )}
      <div className="pro-stats studio-stats">
        <div className="pro-stat">
          <span>Paying</span>
          <strong>{e.paying}</strong>
          <em>{comps ? `+ ${comps} free` : 'subscribers'}</em>
        </div>
        <div className="pro-stat">
          <span>Monthly gross</span>
          <strong>{formatPrice(e.gross)}</strong>
          <em>you keep {formatPrice(e.instructor)}</em>
        </div>
        <div className="pro-stat clickable" onClick={() => go('subscribers')}>
          <span>Waiting list</span>
          <strong>{list.length}</strong>
          <em>{waiting ? `${formatPrice(waiting)}/mo if all join` : 'golfers'}</em>
        </div>
        <div className="pro-stat clickable" onClick={() => go('reviews')}>
          <span>Swing reviews</span>
          <strong>{open}</strong>
          <em>waiting for you</em>
        </div>
      </div>
      <section className="card">
        <h3>How you get paid</h3>
        <p className="small">
          Golfers pay monthly. Scribble keeps {PLATFORM_FEE_BPS / 100}% and you keep the rest, paid out to your bank by our payment partner.
          Card processing (about 2.9% + 30¢ a payment) comes out separately.
          {e.paying > 0 && ` After card fees, about ${formatPrice(e.netEstimate)} a month.`}
        </p>
      </section>
      <section className="card">
        <h3>Post for subscribers</h3>
        <p className="small">When you post, choose “Subscribers only”. Everyone else sees a locked tile that leads to your tiers.</p>
        <button className="btn btn-primary full" onClick={() => nav('new')}>
          New post
        </button>
      </section>
    </>
  );
}

function Subscribers({ meId, data, tiers, tierName, reload }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [tierId, setTierId] = useState(tiers[0]?.id ?? '');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => searchProfiles(q, meId).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q, meId]);

  async function comp(userId, tier = tierId) {
    setMsg('');
    try {
      await giveComp(meId, userId, tier || null);
      setMsg('Free access given.');
      setQ('');
      reload();
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function remove(s) {
    if (!confirm(`Remove ${s.profile.username || s.profile.displayName}'s free access?`)) return;
    try {
      await removeComp(s.id);
      reload();
    } catch (e) {
      setMsg(e.message);
    }
  }

  const waitingIds = new Set(data.subs.filter((s) => s.live).map((s) => s.subscriberId));
  // People who already have access drop off the waiting list.
  const waitingList = data.interest.filter((i) => !waitingIds.has(i.userId));
  return (
    <>
      <section className="card">
        <div className="pro-card-head">
          <h3>Subscribers</h3>
          <button className="btn btn-ghost btn-small" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Done' : '+ Give free access'}
          </button>
        </div>
        {adding && (
          <div className="stack comp-add">
            <select value={tierId} onChange={(e) => setTierId(e.target.value)}>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({formatPrice(t.priceCents)}/mo)
                </option>
              ))}
            </select>
            <input className="share-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search golfers" />
            <ul className="people-pick">
              {found.map((p) => (
                <li key={p.id}>
                  <button onClick={() => comp(p.id)}>
                    <Avatar profile={p} size={36} />
                    <span>
                      <strong>{p.username || p.displayName}</strong>
                      <em>{waitingIds.has(p.id) ? 'already subscribed' : 'tap to give free access'}</em>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {msg && <p className="share-status">{msg}</p>}
        {data.subs.length === 0 && <p className="muted">No subscribers yet.</p>}
        <ul className="people-pick">
          {data.subs.map((s) => (
            <li key={s.id} className="sub-row">
              <Avatar profile={s.profile} size={36} />
              <span>
                <strong>{s.profile.username || s.profile.displayName}</strong>
                <em>
                  {tierName(s.tierId)} · {s.source === 'comp' ? 'free access' : 'paid'}
                  {!s.live ? ` · ${s.status}` : ''} · since {timeAgo(s.createdAt)}
                </em>
              </span>
              {s.source === 'comp' && (
                <button className="btn btn-ghost btn-small" onClick={() => remove(s)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h3>Waiting list</h3>
        <p className="muted small">Golfers who asked to be told when your subscriptions open.</p>
        {waitingList.length === 0 && <p className="muted">Nobody yet. Share your profile to build your list.</p>}
        <ul className="people-pick">
          {waitingList.map((i) => (
            <li key={i.userId} className="sub-row">
              <Avatar profile={i.profile} size={36} />
              <span>
                <strong>{i.profile.username || i.profile.displayName}</strong>
                <em>
                  wants {tierName(i.tierId)} · {timeAgo(i.createdAt)}
                </em>
              </span>
              <button className="btn btn-ghost btn-small" onClick={() => comp(i.userId, i.tierId || tierId)}>
                Give free access
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Reviews({ reviews, reload }) {
  const [openId, setOpenId] = useState(reviews.find((r) => r.status === 'open')?.id ?? null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(r) {
    setBusy(true);
    setError('');
    try {
      await answerReview(r, reply);
      setReply('');
      setOpenId(null);
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!reviews.length) return <p className="muted center">No swing reviews yet. Tiers with swing reviews let subscribers send you videos.</p>;
  return (
    <ul className="review-list studio-reviews">
      {reviews.map((r) => (
        <li key={r.id} className={`card ${r.status}`}>
          <div className="review-head" onClick={() => setOpenId((x) => (x === r.id ? null : r.id))}>
            <Avatar profile={r.student} size={32} />
            <span>
              <strong>{r.student.username || r.student.displayName}</strong>
              <em>
                {timeAgo(r.createdAt)} · {r.status === 'open' ? 'needs your feedback' : 'answered'}
              </em>
            </span>
          </div>
          {openId === r.id && (
            <div className="stack">
              {r.videoUrl ? (
                <video src={r.videoUrl} poster={r.posterUrl ?? undefined} controls playsInline preload="metadata" />
              ) : (
                <p className="muted">Video unavailable.</p>
              )}
              {r.note && <p>“{r.note}”</p>}
              {r.status === 'open' ? (
                <>
                  <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={4000} placeholder="Your feedback and a drill to try…" />
                  <button className="btn btn-primary" disabled={busy || !reply.trim()} onClick={() => send(r)}>
                    {busy ? 'Sending…' : 'Send feedback'}
                  </button>
                  <p className="muted small">They also get it as a direct message.</p>
                </>
              ) : (
                <p className="review-reply">{r.reply}</p>
              )}
              {error && <p className="search-error">{error}</p>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
