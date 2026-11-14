// Social feed data in Supabase: public profiles, posts, media, likes,
// comments, follows, reports. The only module that touches those tables
// and the "media" storage bucket.
import { supabase } from './supabase.js';
import { prepareImage, prepareVideo, extFor } from './media.js';
import { mediaPath, MAX_VIDEO_BYTES } from './socialFormat.js';

const BUCKET = 'media';

function friendly(error) {
  const msg = error?.message ?? String(error);
  if (/fetch|network|Load failed/i.test(msg)) return 'No connection. Try again when you have signal.';
  if (/public_profiles_username_key|duplicate key.*username/i.test(msg)) return 'That username is taken. Try another.';
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return 'That file is too big (50 MB max).';
  if (/mime type|invalid_mime/i.test(msg)) return 'That file type isn’t supported. Use a photo or an MP4/MOV video.';
  return msg;
}

async function call(promise) {
  let result;
  try {
    result = await promise;
  } catch (e) {
    throw new Error(friendly(e));
  }
  if (result.error) throw new Error(friendly(result.error));
  return result.data;
}

export function mediaUrl(path) {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// --- Public profiles ---------------------------------------------------------

const toProfile = (r) =>
  r && {
    id: r.id,
    username: r.username ?? '',
    displayName: r.display_name ?? '',
    bio: r.bio ?? '',
    avatarUrl: mediaUrl(r.avatar_path),
    avatarPath: r.avatar_path ?? null,
    homeCourse: r.home_course ?? '',
  };

export async function getPublicProfile(id) {
  return toProfile(await call(supabase.from('public_profiles').select('*').eq('id', id).maybeSingle()));
}

export async function findProfileByUsername(username) {
  return toProfile(await call(supabase.from('public_profiles').select('*').eq('username', username).maybeSingle()));
}

export async function savePublicProfile(id, p) {
  const row = await call(
    supabase
      .from('public_profiles')
      .upsert({
        id,
        username: p.username,
        display_name: p.displayName?.trim() ?? '',
        bio: p.bio?.trim() ?? '',
        avatar_path: p.avatarPath ?? null,
        home_course: p.homeCourse?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single(),
  );
  return toProfile(row);
}

export async function uploadAvatar(userId, file) {
  const { blob } = await prepareImage(file, 480, 0.85);
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  await call(supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
  return path;
}

export async function profileStats(userId, meId) {
  const head = { count: 'exact', head: true };
  const [posts, followers, following, mine] = await Promise.all([
    supabase.from('posts').select('id', head).eq('user_id', userId),
    supabase.from('follows').select('follower', head).eq('followee', userId),
    supabase.from('follows').select('followee', head).eq('follower', userId),
    meId && meId !== userId
      ? supabase.from('follows').select('follower', head).eq('follower', meId).eq('followee', userId)
      : Promise.resolve({ count: 0 }),
  ]);
  for (const r of [posts, followers, following, mine]) if (r.error) throw new Error(friendly(r.error));
  return { posts: posts.count ?? 0, followers: followers.count ?? 0, following: following.count ?? 0, iFollow: (mine.count ?? 0) > 0 };
}

export function follow(followee) {
  return call(supabase.from('follows').insert({ followee }));
}

export function unfollow(meId, followee) {
  return call(supabase.from('follows').delete().eq('follower', meId).eq('followee', followee));
}

// --- Posts -------------------------------------------------------------------

const POST_SELECT =
  '*, author:public_profiles!posts_user_id_fkey(id, username, display_name, avatar_path), post_media(*), post_likes(count), post_comments(count)';

const toPost = (r) => ({
  id: r.id,
  userId: r.user_id,
  caption: r.caption ?? '',
  course: r.course_key || r.course_name ? { key: r.course_key, name: r.course_name, place: r.course_place } : null,
  createdAt: r.created_at,
  author: toProfile(r.author) ?? { id: r.user_id, username: '', displayName: '' },
  media: [...(r.post_media ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      kind: m.kind,
      path: m.path,
      url: mediaUrl(m.path),
      posterUrl: mediaUrl(m.poster_path),
      posterPath: m.poster_path,
      width: m.width,
      height: m.height,
    })),
  likeCount: r.post_likes?.[0]?.count ?? 0,
  commentCount: r.post_comments?.[0]?.count ?? 0,
});

async function withMyLikes(posts, meId) {
  if (!posts.length || !meId) return posts.map((p) => ({ ...p, likedByMe: false }));
  const rows = await call(
    supabase.from('post_likes').select('post_id').eq('user_id', meId).in('post_id', posts.map((p) => p.id)),
  );
  const liked = new Set(rows.map((r) => r.post_id));
  return posts.map((p) => ({ ...p, likedByMe: liked.has(p.id) }));
}

// Newest first. `before` (an ISO time) loads the next page.
export async function listFeed({ meId, mode = 'all', before = null, limit = 10 }) {
  let q = supabase.from('posts').select(POST_SELECT).order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  if (mode === 'following') {
    const rows = await call(supabase.from('follows').select('followee').eq('follower', meId));
    const ids = [meId, ...rows.map((r) => r.followee)];
    q = q.in('user_id', ids);
  }
  return withMyLikes((await call(q)).map(toPost), meId);
}

export async function listUserPosts(userId, meId) {
  const rows = await call(supabase.from('posts').select(POST_SELECT).eq('user_id', userId).order('created_at', { ascending: false }).limit(60));
  return withMyLikes(rows.map(toPost), meId);
}

export async function listCoursePosts(courseKey, meId) {
  const rows = await call(
    supabase.from('posts').select(POST_SELECT).eq('course_key', courseKey).order('created_at', { ascending: false }).limit(60),
  );
  return withMyLikes(rows.map(toPost), meId);
}

export async function getPost(id, meId) {
  const row = await call(supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle());
  if (!row) return null;
  return (await withMyLikes([toPost(row)], meId))[0];
}

// files: File[] (photos/videos). onProgress(done, total).
export async function createPost({ userId, caption, course, files, onProgress }) {
  for (const f of files) {
    if (f.type.startsWith('video/') && f.size > MAX_VIDEO_BYTES) {
      throw new Error(`“${f.name}” is over 50 MB. Trim it to a shorter clip and try again.`);
    }
  }
  const post = await call(
    supabase
      .from('posts')
      .insert({
        caption: caption.trim(),
        course_key: course?.key ?? null,
        course_name: course?.name ?? null,
        course_place: course?.place ?? null,
      })
      .select()
      .single(),
  );
  const uploaded = [];
  try {
    const rows = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isVideo = f.type.startsWith('video/');
      const prepared = isVideo ? await prepareVideo(f) : await prepareImage(f);
      const path = mediaPath(userId, post.id, i, isVideo ? extFor(f) : 'jpg');
      await call(
        supabase.storage
          .from(BUCKET)
          .upload(path, prepared.blob, { contentType: isVideo ? f.type || 'video/mp4' : 'image/jpeg', cacheControl: '31536000' }),
      );
      uploaded.push(path);
      let posterPath = null;
      if (isVideo && prepared.poster) {
        posterPath = mediaPath(userId, post.id, `${i}-poster`, 'jpg');
        await call(supabase.storage.from(BUCKET).upload(posterPath, prepared.poster, { contentType: 'image/jpeg', cacheControl: '31536000' }));
        uploaded.push(posterPath);
      }
      rows.push({
        post_id: post.id,
        position: i,
        kind: isVideo ? 'video' : 'image',
        path,
        poster_path: posterPath,
        width: prepared.width,
        height: prepared.height,
      });
      onProgress?.(i + 1, files.length);
    }
    if (rows.length) await call(supabase.from('post_media').insert(rows));
    return post.id;
  } catch (e) {
    // Don't leave a half-made post behind.
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    await supabase.from('posts').delete().eq('id', post.id);
    throw e;
  }
}

export async function deletePost(post) {
  const paths = post.media.flatMap((m) => [m.path, m.posterPath]).filter(Boolean);
  await call(supabase.from('posts').delete().eq('id', post.id));
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

export function likePost(postId) {
  return call(supabase.from('post_likes').insert({ post_id: postId }));
}

export function unlikePost(meId, postId) {
  return call(supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', meId));
}

export async function listComments(postId) {
  const rows = await call(
    supabase
      .from('post_comments')
      .select('*, author:public_profiles!post_comments_user_id_fkey(id, username, display_name, avatar_path)')
      .eq('post_id', postId)
      .order('created_at'),
  );
  return rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at, userId: r.user_id, author: toProfile(r.author) }));
}

export function addComment(postId, body) {
  return call(supabase.from('post_comments').insert({ post_id: postId, body: body.trim() }));
}

export function deleteComment(id) {
  return call(supabase.from('post_comments').delete().eq('id', id));
}

export function reportPost(postId, reason) {
  return call(supabase.from('post_reports').insert({ post_id: postId, reason: reason?.slice(0, 500) ?? '' }));
}
