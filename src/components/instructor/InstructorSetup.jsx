import { useEffect, useState } from 'react';
import { getInstructor, saveInstructor, saveTiers } from '../../lib/instructors.js';
import { formatPrice, parsePrice, priceProblem, tierPreview, PLATFORM_FEE_BPS } from '../../lib/instructor/fees.js';

const STARTER_TIERS = [
  { name: 'Tips', price: '4.99', perks: 'Subscriber-only tips and drill videos every week.', reviewsPerMonth: 0 },
  { name: 'Swing reviews', price: '19.99', perks: 'Everything in Tips, plus I review your swing videos.', reviewsPerMonth: 2 },
];

// Become an instructor, or edit your instructor page and subscription tiers.
export default function InstructorSetup({ meId, back, onSaved }) {
  const [loaded, setLoaded] = useState(null); // { instructor, tiers } | false (new)
  const [form, setForm] = useState({ headline: '', credentials: '', specialties: '', lessonInfo: '', active: true });
  const [tiers, setTiers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getInstructor(meId)
      .then((d) => {
        setLoaded(d ?? false);
        if (d) {
          const i = d.instructor;
          setForm({ headline: i.headline, credentials: i.credentials, specialties: i.specialties.join(', '), lessonInfo: i.lessonInfo, active: i.active });
          setTiers(d.tiers.map((t) => ({ ...t, price: (t.priceCents / 100).toFixed(2) })));
        } else {
          setTiers(STARTER_TIERS.map((t) => ({ ...t })));
        }
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(false);
      });
  }, [meId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setTier = (i, patch) => setTiers((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  async function save() {
    setError('');
    if (!form.headline.trim()) return setError('Add a headline, e.g. “PGA teaching pro · short game”.');
    if (!tiers.length) return setError('Add at least one subscription tier.');
    const clean = [];
    for (const t of tiers) {
      const cents = parsePrice(t.price);
      const problem = !t.name.trim() ? 'Every tier needs a name.' : priceProblem(cents);
      if (problem) return setError(`${t.name || 'A tier'}: ${problem}`);
      clean.push({ ...t, priceCents: cents, reviewsPerMonth: Math.max(0, Math.min(31, Number(t.reviewsPerMonth) || 0)) });
    }
    setBusy(true);
    try {
      await saveInstructor(meId, { ...form, specialties: form.specialties.split(',') }, !loaded);
      await saveTiers(meId, clean, loaded ? loaded.tiers : []);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loaded === null) return <div className="screen"><p className="muted center">Loading…</p></div>;

  return (
    <div className="screen instructor-setup">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={back}>
          ‹ Back
        </button>
        <h1>{loaded ? 'Instructor page' : 'Teach on Scribble'}</h1>
        <span />
      </div>

      {!loaded && (
        <section className="card teach-intro">
          <h3>Get paid for your tips and lessons</h3>
          <p>
            Golfers subscribe to you monthly for subscriber-only tips, drills and swing reviews. You set the prices; Scribble keeps{' '}
            {PLATFORM_FEE_BPS / 100}% and you keep the rest.
          </p>
          <p className="muted small">Paid subscriptions open soon. Until then, golfers can tap “Notify me”, and you can give free access to anyone.</p>
        </section>
      )}

      <section className="card stack">
        <label className="field">
          <span>Headline</span>
          <input value={form.headline} onChange={set('headline')} maxLength={120} placeholder="PGA teaching pro · short game and putting" />
        </label>
        <label className="field">
          <span>Credentials</span>
          <input value={form.credentials} onChange={set('credentials')} maxLength={300} placeholder="PGA Class A, 12 years teaching at Torrey Pines" />
        </label>
        <label className="field">
          <span>Specialties (comma separated)</span>
          <input value={form.specialties} onChange={set('specialties')} placeholder="Driver, short game, putting, juniors" />
        </label>
        <label className="field">
          <span>In-person lessons (optional)</span>
          <textarea rows={3} value={form.lessonInfo} onChange={set('lessonInfo')} maxLength={1000} placeholder="Where you teach and how to book a lesson." />
        </label>
        {loaded && (
          <label className="check-row">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            <span>Show my instructor page (untick to pause)</span>
          </label>
        )}
      </section>

      <h3 className="section-h">Subscription tiers</h3>
      {tiers.map((t, i) => {
        const cents = parsePrice(t.price);
        const preview = cents && !priceProblem(cents) ? tierPreview(cents) : null;
        return (
          <section key={t.id ?? `new-${i}`} className="card stack tier-edit">
            <div className="row2">
              <label className="field">
                <span>Tier name</span>
                <input value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} maxLength={40} />
              </label>
              <label className="field">
                <span>Price per month ($)</span>
                <input inputMode="decimal" value={t.price} onChange={(e) => setTier(i, { price: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>What subscribers get</span>
              <textarea rows={2} value={t.perks} onChange={(e) => setTier(i, { perks: e.target.value })} maxLength={500} />
            </label>
            <label className="field">
              <span>Swing reviews per month</span>
              <select value={t.reviewsPerMonth} onChange={(e) => setTier(i, { reviewsPerMonth: Number(e.target.value) })}>
                {[0, 1, 2, 3, 4, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'None' : n}
                  </option>
                ))}
              </select>
            </label>
            {preview && (
              <p className="tier-preview">
                Golfer pays <strong>{formatPrice(cents)}</strong>/mo · you keep <strong>{formatPrice(preview.instructor)}</strong> · Scribble{' '}
                {formatPrice(preview.platform)}
                <span className="muted small"> (card processing, about {formatPrice(preview.cardEstimate)}, is separate)</span>
              </p>
            )}
            <button className="btn btn-ghost btn-small danger" onClick={() => setTiers((list) => list.filter((_, j) => j !== i))}>
              Remove tier
            </button>
          </section>
        );
      })}
      {tiers.length < 4 && (
        <button className="btn btn-ghost outline full" onClick={() => setTiers((l) => [...l, { name: '', price: '9.99', perks: '', reviewsPerMonth: 0 }])}>
          + Add a tier
        </button>
      )}

      {error && <div className="card error-box">{error}</div>}
      <div className="stack sticky-save">
        <button className="btn btn-primary btn-xl" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : loaded ? 'Save' : 'Create my instructor page'}
        </button>
      </div>
    </div>
  );
}
