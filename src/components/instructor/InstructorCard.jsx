import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteOpenReview, listMyReviews, myAccess, registerInterest, requestReview, withdrawInterest } from '../../lib/instructors.js';
import { formatPrice } from '../../lib/instructor/fees.js';
import { PAYMENTS_LIVE, startCheckout } from '../../lib/instructor/payments.js';
import { timeAgo } from '../../lib/socialFormat.js';

// The instructor part of a profile: who they are, their tiers, and (for
// subscribers) swing reviews. `data` is { instructor, tiers }.
export default function InstructorCard({ data, userId, meId, mine, nav }) {
  const { instructor, tiers } = data;
  const [access, setAccess] = useState(null);
  const [sheet, setSheet] = useState(null); // 'subscribe' | 'reviews'
  const live = tiers.filter((t) => t.active);

  const load = useCallback(() => {
    if (mine) return;
    myAccess(userId, meId).then(setAccess).catch(() => setAccess({ subscription: null, interested: false, reviewsLeft: 0 }));
  }, [userId, meId, mine]);
  useEffect(load, [load]);

  const sub = access?.subscription;
  const subTier = sub && tiers.find((t) => t.id === sub.tierId);
  const lowest = live.length ? Math.min(...live.map((t) => t.priceCents)) : null;

  return (
    <section className="card instructor-card">
      <div className="instructor-badge-row">
        <span className={`instructor-badge ${instructor.verified ? 'verified' : ''}`}>{instructor.verified ? '✓ Verified instructor' : 'Instructor'}</span>
      </div>
      {instructor.headline && <h3 className="instructor-headline">{instructor.headline}</h3>}
      {instructor.credentials && <p className="muted small">{instructor.credentials}</p>}
      {instructor.specialties.length > 0 && (
        <div className="chips">
          {instructor.specialties.map((s) => (
            <span key={s} className="chip static">
              {s}
            </span>
          ))}
        </div>
      )}
      {instructor.lessonInfo && <p className="lesson-info">{instructor.lessonInfo}</p>}

      {mine ? (
        <div className="row2">
          <button className="btn btn-primary" onClick={() => nav('studio')}>
            Instructor studio
          </button>
          <button className="btn btn-ghost outline" onClick={() => nav('teach')}>
            Edit page
          </button>
        </div>
      ) : sub ? (
        <div className="stack">
          <p className="subscribed-line">
            ✓ Subscribed{subTier ? ` · ${subTier.name}` : ''}
            {sub.source === 'comp' ? ' (free access)' : ''}
          </p>
          {(subTier?.reviewsPerMonth ?? 0) > 0 && (
            <button className="btn btn-primary" onClick={() => setSheet('reviews')}>
              Swing reviews · {access.reviewsLeft} left this month
            </button>
          )}
        </div>
      ) : (
        live.length > 0 && (
          <button className="btn btn-primary full" onClick={() => setSheet('subscribe')}>
            {access?.interested ? 'You’ll be notified · See tiers' : `Subscribe · from ${formatPrice(lowest)}/mo`}
          </button>
        )
      )}

      {sheet === 'subscribe' && (
        <SubscribeSheet
          instructorId={userId}
          meId={meId}
          tiers={live}
          access={access}
          onClose={() => setSheet(null)}
          onChanged={load}
        />
      )}
      {sheet === 'reviews' && (
        <ReviewsSheet instructorId={userId} meId={meId} left={access.reviewsLeft} onClose={() => setSheet(null)} onChanged={load} />
      )}
    </section>
  );
}

function SubscribeSheet({ instructorId, meId, tiers, access, onClose, onChanged }) {
  const [tierId, setTierId] = useState(access?.interestTierId ?? tiers[0]?.id);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function go() {
    setBusy(true);
    setMsg('');
    try {
      if (PAYMENTS_LIVE) {
        const url = await startCheckout(tiers.find((t) => t.id === tierId));
        window.location.href = url;
        return;
      }
      await registerInterest(instructorId, tierId);
      setMsg('You’re on the list. We’ll let you know when subscriptions open.');
      onChanged();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelInterest() {
    try {
      await withdrawInterest(instructorId, meId);
      onChanged();
      onClose();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Subscribe" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Subscribe</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <ul className="tier-pick">
          {tiers.map((t) => (
            <li key={t.id}>
              <button className={tierId === t.id ? 'on' : ''} onClick={() => setTierId(t.id)} aria-pressed={tierId === t.id}>
                <span className="tier-top">
                  <strong>{t.name}</strong>
                  <strong>
                    {formatPrice(t.priceCents)}
                    <small>/mo</small>
                  </strong>
                </span>
                {t.perks && <span className="tier-perks">{t.perks}</span>}
                {t.reviewsPerMonth > 0 && (
                  <span className="tier-perks">
                    🎥 {t.reviewsPerMonth} swing review{t.reviewsPerMonth === 1 ? '' : 's'} a month
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {!PAYMENTS_LIVE && <p className="muted small center">Paid subscriptions open soon. Tap below and we&apos;ll notify you.</p>}
        <button className="btn btn-primary btn-xl full" disabled={busy || !tierId} onClick={go}>
          {PAYMENTS_LIVE ? 'Continue to payment' : access?.interested ? 'Update my choice' : 'Notify me'}
        </button>
        {access?.interested && !PAYMENTS_LIVE && (
          <button className="link center-link" onClick={cancelInterest}>
            Don&apos;t notify me
          </button>
        )}
        {msg && <p className="share-status">{msg}</p>}
      </div>
    </div>
  );
}

// Subscriber: send a swing video, see answers.
function ReviewsSheet({ instructorId, meId, left, onClose, onChanged }) {
  const [list, setList] = useState(null);
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const input = useRef(null);

  const load = useCallback(() => {
    listMyReviews(instructorId, meId)
      .then(setList)
      .catch((e) => {
        setError(e.message);
        setList([]);
      });
  }, [instructorId, meId]);
  useEffect(load, [load]);

  async function send() {
    setError('');
    try {
      await requestReview({ instructorId, meId, file, note, onProgress: setProgress });
      setFile(null);
      setNote('');
      load();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setProgress('');
    }
  }

  async function remove(r) {
    if (!confirm('Take back this swing video? It hasn’t been answered yet.')) return;
    try {
      await deleteOpenReview(r);
      load();
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Swing reviews" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Swing reviews</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {left > 0 ? (
          <section className="review-new">
            <input ref={input} type="file" accept="video/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button className="btn btn-ghost outline full" onClick={() => input.current?.click()}>
              {file ? `🎥 ${file.name}` : '🎥 Choose a swing video'}
            </button>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What should they look at? (e.g. slicing my driver)" />
            <button className="btn btn-primary full" disabled={!file || !!progress} onClick={send}>
              {progress || `Send for review (${left} left this month)`}
            </button>
          </section>
        ) : (
          <p className="muted">You&apos;ve used this month&apos;s swing reviews. More next month.</p>
        )}
        {error && <p className="search-error">{error}</p>}
        <h3>Your reviews</h3>
        {list === null && <p className="muted">Loading…</p>}
        {list?.length === 0 && <p className="muted">None yet.</p>}
        <ul className="review-list">
          {(list ?? []).map((r) => (
            <li key={r.id}>
              {r.videoUrl && <video src={r.videoUrl} poster={r.posterUrl ?? undefined} controls playsInline preload="metadata" />}
              <div>
                <p className="muted small">
                  Sent {timeAgo(r.createdAt)} · {r.status === 'open' ? 'waiting for feedback' : `answered ${timeAgo(r.answeredAt)}`}
                </p>
                {r.note && <p>“{r.note}”</p>}
                {r.reply && <p className="review-reply">{r.reply}</p>}
                {r.status === 'open' && (
                  <button className="link small-link" onClick={() => remove(r)}>
                    Take back
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
