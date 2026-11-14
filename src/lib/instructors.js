// Instructors in Supabase (supabase/instructors.sql): instructor profiles,
// tiers, subscriptions, "notify me" interest and swing reviews, plus swing
// review videos in the private "premium" bucket. The only module that
// touches those tables. Money math lives in instructor/fees.js; taking
// payments lives in instructor/payments.js (not live yet).
import { supabase } from './supabase.js';
import { call, PREMIUM, signPremium } from './social.js';
import { prepareVideo, extFor } from './media.js';
import { MAX_VIDEO_BYTES } from './socialFormat.js';
import { sendMessage, startDM } from './messages.js';

const toInstructor = (r) =>
  r && {
    userId: r.user_id,
    headline: r.headline ?? '',
    credentials: r.credentials ?? '',
    specialties: r.specialties ?? [],
    lessonInfo: r.lesson_info ?? '',
    verified: !!r.verified,
    active: r.active !== false,
    paymentsConnected: !!r.stripe_account_id,
  };

const toTier = (r) => ({
  id: r.id,
  name: r.name,
  priceCents: r.price_cents,
  perks: r.perks ?? '',
  reviewsPerMonth: r.reviews_per_month ?? 0,
  position: r.position ?? 0,
  active: r.active !== false,
});

const toSub = (r) => ({
  id: r.id,
  instructorId: r.instructor_id,
  subscriberId: r.subscriber_id,
  tierId: r.tier_id,
  status: r.status,
  source: r.source,
  currentPeriodEnd: r.current_period_end,
  createdAt: r.created_at,
});

const isLive = (s) => s.status === 'active' && (!s.currentPeriodEnd || s.currentPeriodEnd > new Date().toISOString());

// { instructor, tiers } or null if this golfer doesn't teach (or the
// instructors tables don't exist yet).
export async function getInstructor(userId) {
  const row = await call(supabase.from('instructor_profiles').select('*').eq('user_id', userId).maybeSingle()).catch(() => null);
  if (!row) return null;
  const tiers = await call(supabase.from('instructor_tiers').select('*').eq('instructor_id', userId).order('position'));
  return { instructor: toInstructor(row), tiers: tiers.map(toTier) };
}

// Which of these golfers teach: Map(userId -> { verified }), for badges.
export async function instructorBadges(userIds) {
  if (!userIds.length) return new Map();
  const rows = await call(supabase.from('instructor_profiles').select('user_id, verified').in('user_id', userIds).eq('active', true)).catch(() => []);
  return new Map(rows.map((r) => [r.user_id, { verified: !!r.verified }]));
}

export async function saveInstructor(meId, p, isNew) {
  const row = {
    headline: p.headline.trim().slice(0, 120),
    credentials: p.credentials.trim().slice(0, 300),
    specialties: p.specialties.map((x) => x.trim()).filter(Boolean).slice(0, 8),
    lesson_info: p.lessonInfo.trim().slice(0, 1000),
    active: p.active !== false,
  };
  if (isNew) return call(supabase.from('instructor_profiles').insert({ user_id: meId, ...row }));
  return call(supabase.from('instructor_profiles').update(row).eq('user_id', meId));
}

// Make the saved tiers match `tiers` (in order): add, update, remove.
export async function saveTiers(meId, tiers, existing) {
  const keep = new Set(tiers.filter((t) => t.id).map((t) => t.id));
  for (const old of existing) if (!keep.has(old.id)) await call(supabase.from('instructor_tiers').delete().eq('id', old.id));
  for (const [i, t] of tiers.entries()) {
    const row = {
      name: t.name.trim().slice(0, 40),
      price_cents: t.priceCents,
      perks: t.perks.trim().slice(0, 500),
      reviews_per_month: t.reviewsPerMonth,
      position: i,
      active: t.active !== false,
    };
    if (t.id) await call(supabase.from('instructor_tiers').update(row).eq('id', t.id));
    else await call(supabase.from('instructor_tiers').insert({ instructor_id: meId, ...row }));
  }
}

// My relationship with an instructor: { subscription, interested, reviewsLeft }.
export async function myAccess(instructorId, meId) {
  const [subs, interest, left] = await Promise.all([
    call(supabase.from('instructor_subscriptions').select('*').eq('instructor_id', instructorId).eq('subscriber_id', meId)).catch(() => []),
    call(supabase.from('subscription_interest').select('tier_id').eq('instructor_id', instructorId).eq('user_id', meId)).catch(() => []),
    call(supabase.rpc('reviews_left', { p_instructor: instructorId })).catch(() => 0),
  ]);
  const sub = subs.map(toSub).find(isLive) ?? null;
  return { subscription: sub, interested: interest.length > 0, interestTierId: interest[0]?.tier_id ?? null, reviewsLeft: sub ? left ?? 0 : 0 };
}

export function registerInterest(instructorId, tierId) {
  return call(
    supabase
      .from('subscription_interest')
      .upsert({ instructor_id: instructorId, tier_id: tierId }, { onConflict: 'instructor_id,user_id' }),
  );
}

export function withdrawInterest(instructorId, meId) {
  return call(supabase.from('subscription_interest').delete().eq('instructor_id', instructorId).eq('user_id', meId));
}

async function profilesById(ids) {
  if (!ids.length) return new Map();
  const rows = await call(supabase.from('public_profiles').select('id, username, display_name, avatar_path').in('id', ids));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        username: r.username ?? '',
        displayName: r.display_name ?? '',
        avatarUrl: r.avatar_path ? supabase.storage.from('media').getPublicUrl(r.avatar_path).data.publicUrl : null,
      },
    ]),
  );
}

// Instructor dashboard: subscribers (newest first) and people waiting.
export async function listSubscribers(meId) {
  const rows = (await call(supabase.from('instructor_subscriptions').select('*').eq('instructor_id', meId).order('created_at', { ascending: false }))).map(toSub);
  const people = await profilesById(rows.map((r) => r.subscriberId));
  return rows.map((r) => ({ ...r, live: isLive(r), profile: people.get(r.subscriberId) ?? { id: r.subscriberId, username: '', displayName: 'Golfer' } }));
}

export async function listInterest(meId) {
  const rows = await call(supabase.from('subscription_interest').select('*').eq('instructor_id', meId).order('created_at', { ascending: false }));
  const people = await profilesById(rows.map((r) => r.user_id));
  return rows.map((r) => ({ userId: r.user_id, tierId: r.tier_id, createdAt: r.created_at, profile: people.get(r.user_id) ?? { id: r.user_id, username: '', displayName: 'Golfer' } }));
}

// Free access an instructor gives (beta testers, students, friends).
export async function giveComp(meId, userId, tierId) {
  const existing = await call(supabase.from('instructor_subscriptions').select('id, source').eq('instructor_id', meId).eq('subscriber_id', userId));
  if (existing[0]?.source === 'stripe') throw new Error('This golfer already pays for a subscription.');
  if (existing[0]) return call(supabase.from('instructor_subscriptions').update({ tier_id: tierId, status: 'active' }).eq('id', existing[0].id));
  return call(supabase.from('instructor_subscriptions').insert({ instructor_id: meId, subscriber_id: userId, tier_id: tierId, source: 'comp' }));
}

export function removeComp(subscriptionId) {
  return call(supabase.from('instructor_subscriptions').delete().eq('id', subscriptionId).eq('source', 'comp'));
}

// --- Swing reviews -------------------------------------------------------------

const toReview = (r, signed) => ({
  id: r.id,
  instructorId: r.instructor_id,
  studentId: r.student_id,
  note: r.note ?? '',
  status: r.status,
  reply: r.reply ?? '',
  answeredAt: r.answered_at,
  createdAt: r.created_at,
  videoPath: r.video_path,
  posterPath: r.poster_path,
  videoUrl: signed.get(r.video_path) ?? null,
  posterUrl: signed.get(r.poster_path) ?? null,
});

async function reviewsWithLinks(rows) {
  const signed = await signPremium(rows.flatMap((r) => [r.video_path, r.poster_path]));
  return rows.map((r) => toReview(r, signed));
}

// As a student: my reviews with one instructor, newest first.
export async function listMyReviews(instructorId, meId) {
  const rows = await call(
    supabase.from('swing_reviews').select('*').eq('instructor_id', instructorId).eq('student_id', meId).order('created_at', { ascending: false }),
  );
  return reviewsWithLinks(rows);
}

// As an instructor: open first, then answered; each newest first.
export async function listReviewsForInstructor(meId) {
  const rows = await call(supabase.from('swing_reviews').select('*').eq('instructor_id', meId).order('created_at', { ascending: false }).limit(200));
  const people = await profilesById([...new Set(rows.map((r) => r.student_id))]);
  const list = await reviewsWithLinks(rows);
  return list
    .map((r) => ({ ...r, student: people.get(r.studentId) ?? { id: r.studentId, username: '', displayName: 'Golfer' } }))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));
}

// Send a swing video to an instructor for review (uses one of this month's reviews).
export async function requestReview({ instructorId, meId, file, note, onProgress }) {
  if (!file?.type?.startsWith('video/')) throw new Error('Pick a video of your swing.');
  if (file.size > MAX_VIDEO_BYTES * 2) throw new Error('That video is over 100 MB. Trim it to just the swing.');
  onProgress?.('Preparing video…');
  const prepared = await prepareVideo(file);
  const stamp = Date.now();
  const base = `reviews/${instructorId}/${meId}/${stamp}`;
  const videoPath = `${base}.${extFor(file)}`;
  const bucket = supabase.storage.from(PREMIUM);
  onProgress?.('Uploading…');
  await call(bucket.upload(videoPath, prepared.blob, { contentType: file.type || 'video/mp4' }));
  let posterPath = null;
  if (prepared.poster) {
    posterPath = `${base}-poster.jpg`;
    await call(bucket.upload(posterPath, prepared.poster, { contentType: 'image/jpeg' })).catch(() => (posterPath = null));
  }
  try {
    await call(supabase.from('swing_reviews').insert({ instructor_id: instructorId, video_path: videoPath, poster_path: posterPath, note: note.trim().slice(0, 1000) }));
  } catch (e) {
    await bucket.remove([videoPath, posterPath].filter(Boolean));
    throw new Error(/row-level security/i.test(e.message) ? 'You’ve used this month’s swing reviews.' : e.message);
  }
}

// Answer a review; the student also gets it as a direct message.
export async function answerReview(review, reply) {
  const text = reply.trim().slice(0, 4000);
  if (!text) throw new Error('Write your feedback first.');
  await call(
    supabase.from('swing_reviews').update({ status: 'answered', reply: text, answered_at: new Date().toISOString() }).eq('id', review.id),
  );
  try {
    const conv = await startDM(review.studentId);
    await sendMessage(conv, { body: `Swing review: ${text}`.slice(0, 2000) });
  } catch {
    // The review is saved either way; the message is a courtesy.
  }
}

export async function deleteOpenReview(review) {
  await call(supabase.from('swing_reviews').delete().eq('id', review.id).eq('status', 'open'));
  await supabase.storage.from(PREMIUM).remove([review.videoPath, review.posterPath].filter(Boolean));
}
