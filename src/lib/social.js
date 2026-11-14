// Social feed data in Supabase: public profiles, posts, media, likes,
// comments, follows, reports, saved posts and save folders. The only module
// that touches those tables and the "media" storage bucket (direct messages
// live in messages.js).
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

export async function call(promise) {
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
    homeCourseKey: r.home_course_key ?? null,
    homeCoursePlace: r.home_course_place ?? '',
  };

export async function getPublicProfile(id) {
  return toProfile(await call(supabase.from('public_profiles').select('*').eq('id', id).maybeSingle()));
}

export async function findProfileByUsername(username) {
  return toProfile(await call(supabase.from('public_profiles').select('*').eq('username', username).maybeSingle()));
}

// People search for messages and sharing: username or name contains q.
export async function searchProfiles(q, meId) {
  const term = q.trim().replace(/[%_,()]/g, '');
  if (term.length < 2) return [];
  const rows = await call(
    supabase
      .from('public_profiles')
      .select('*')
      .not('username', 'is', null)
      .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
      .limit(20),
  );
  const hidden = meId ? await hiddenUserIds(meId).catch(() => new Set()) : new Set();
  return rows.filter((r) => r.id !== meId && !hidden.has(r.id)).map(toProfile);
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
        home_course_key: p.homeCourse?.trim() ? p.homeCourseKey ?? null : null,
        home_course_place: p.homeCourse?.trim() ? p.homeCoursePlace || null : null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single(),
  );
  return toProfile(row);
}

// Account settings changed the home course: mirror it onto the public
// profile. Does nothing until the golfer has set up their golf profile.
export function syncHomeCourse(userId, home) {
  return call(
    supabase
      .from('public_profiles')
      .update({
        home_course: home?.name || null,
        home_course_key: home?.key ?? null,
        home_course_place: home?.place || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId),
  );
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

export const POST_SELECT =
  '*, author:public_profiles!posts_user_id_fkey(id, username, display_name, avatar_path), post_media(*), post_likes(count), post_comments(count)';

export const toPost = (r) => ({
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

// --- Blocking ------------------------------------------------------------------
// People you blocked, and people who blocked you, are hidden from each other.
let hiddenCache = null; // { meId, ids: Set }

export async function hiddenUserIds(meId) {
  if (hiddenCache?.meId === meId) return hiddenCache.ids;
  const rows = await call(supabase.from('blocks').select('blocker, blocked'));
  const ids = new Set(rows.map((r) => (r.blocker === meId ? r.blocked : r.blocker)));
  hiddenCache = { meId, ids };
  return ids;
}

export async function blockUser(userId) {
  await call(supabase.rpc('block_user', { p_user: userId }));
  hiddenCache = null;
}

export async function unblockUser(meId, userId) {
  await call(supabase.from('blocks').delete().eq('blocker', meId).eq('blocked', userId));
  hiddenCache = null;
}

// Who I've blocked, with their public profiles, for Settings.
export async function listBlocked(meId) {
  const rows = await call(supabase.from('blocks').select('blocked, created_at').eq('blocker', meId)).catch(() => []);
  if (!rows.length) return [];
  const profiles = await call(
    supabase.from('public_profiles').select('*').in('id', rows.map((r) => r.blocked)),
  );
  return rows.map((r) => ({
    id: r.blocked,
    profile: toProfile(profiles.find((p) => p.id === r.blocked)) ?? { id: r.blocked, username: '', displayName: 'Golfer' },
  }));
}

// Does either of us block the other?
// Fails soft: if blocking isn't set up yet (account_safety.sql not run), no one is blocked.
export async function blockStatus(meId, userId) {
  const rows = await call(
    supabase
      .from('blocks')
      .select('blocker, blocked')
      .or(`and(blocker.eq.${meId},blocked.eq.${userId}),and(blocker.eq.${userId},blocked.eq.${meId})`),
  ).catch(() => []);
  return { iBlocked: rows.some((r) => r.blocker === meId), blockedMe: rows.some((r) => r.blocker === userId) };
}

export async function visible(posts, meId) {
  const hidden = await hiddenUserIds(meId).catch(() => new Set());
  return hidden.size ? posts.filter((p) => !hidden.has(p.userId)) : posts;
}

// Adds likedByMe and savedByMe. Saves fail soft (saves_messages.sql not run yet).
export async function withMyLikes(posts, meId) {
  if (!posts.length || !meId) return posts.map((p) => ({ ...p, likedByMe: false, savedByMe: false }));
  const ids = posts.map((p) => p.id);
  const [rows, saves] = await Promise.all([
    call(supabase.from('post_likes').select('post_id').eq('user_id', meId).in('post_id', ids)),
    call(supabase.from('saved_posts').select('post_id').eq('user_id', meId).in('post_id', ids)).catch(() => []),
  ]);
  const liked = new Set(rows.map((r) => r.post_id));
  const saved = new Set(saves.map((r) => r.post_id));
  return posts.map((p) => ({ ...p, likedByMe: liked.has(p.id), savedByMe: saved.has(p.id) }));
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
  return withMyLikes(await visible((await call(q)).map(toPost), meId), meId);
}

export async function listUserPosts(userId, meId) {
  const rows = await call(supabase.from('posts').select(POST_SELECT).eq('user_id', userId).order('created_at', { ascending: false }).limit(60));
  return withMyLikes(await visible(rows.map(toPost), meId), meId);
}

export async function listCoursePosts(courseKey, meId) {
  const rows = await call(
    supabase.from('posts').select(POST_SELECT).eq('course_key', courseKey).order('created_at', { ascending: false }).limit(60),
  );
  return withMyLikes(await visible(rows.map(toPost), meId), meId);
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

export async function listComments(postId, meId) {
  const rows = await call(
    supabase
      .from('post_comments')
      .select('*, author:public_profiles!post_comments_user_id_fkey(id, username, display_name, avatar_path)')
      .eq('post_id', postId)
      .order('created_at'),
  );
  const hidden = meId ? await hiddenUserIds(meId).catch(() => new Set()) : new Set();
  return rows
    .filter((r) => !hidden.has(r.user_id))
    .map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at, userId: r.user_id, author: toProfile(r.author) }));
}

export function addComment(postId, body) {
  return call(supabase.from('post_comments').insert({ post_id: postId, body: body.trim() }));
}

export function deleteComment(id) {
  return call(supabase.from('post_comments').delete().eq('id', id));
}

// Delete every photo/video/avatar in my folder (before deleting my account).
export async function deleteMyMedia(userId) {
  const bucket = supabase.storage.from(BUCKET);
  const paths = [];
  const { data: top, error } = await bucket.list(userId, { limit: 1000 });
  if (error) throw new Error(friendly(error));
  for (const item of top ?? []) {
    if (item.id) {
      paths.push(`${userId}/${item.name}`); // a file (e.g. avatar)
    } else {
      const { data: inner } = await bucket.list(`${userId}/${item.name}`, { limit: 1000 });
      for (const f of inner ?? []) paths.push(`${userId}/${item.name}/${f.name}`);
    }
  }
  for (let i = 0; i < paths.length; i += 100) {
    const { error: e } = await bucket.remove(paths.slice(i, i + 100));
    if (e) throw new Error(friendly(e));
  }
  return paths.length;
}

// --- Saved posts and folders (private to you) -----------------------------------

export function savePost(postId) {
  return call(supabase.from('saved_posts').upsert({ post_id: postId }, { onConflict: 'user_id,post_id', ignoreDuplicates: true }));
}

// Unsaving also takes the post out of every folder.
export async function unsavePost(meId, postId) {
  await call(supabase.from('save_folder_posts').delete().eq('user_id', meId).eq('post_id', postId));
  await call(supabase.from('saved_posts').delete().eq('user_id', meId).eq('post_id', postId));
}

// Posts by id, in the order given (missing/hidden ones dropped).
async function postsInOrder(ids, meId) {
  if (!ids.length) return [];
  const rows = await call(supabase.from('posts').select(POST_SELECT).in('id', ids));
  const byId = new Map(rows.map((r) => [r.id, toPost(r)]));
  const posts = ids.map((id) => byId.get(id)).filter(Boolean);
  return withMyLikes(await visible(posts, meId), meId);
}

export async function listSaved(meId) {
  const rows = await call(
    supabase.from('saved_posts').select('post_id').eq('user_id', meId).order('created_at', { ascending: false }).limit(300),
  );
  return postsInOrder(rows.map((r) => r.post_id), meId);
}

// [{ id, name, count, covers: [url x up to 4] }] oldest first, plus the
// covers of "All saved".
export async function listFolders(meId) {
  const [folders, links, saved] = await Promise.all([
    call(supabase.from('save_folders').select('*').eq('user_id', meId).order('created_at')),
    call(supabase.from('save_folder_posts').select('folder_id, post_id, created_at').eq('user_id', meId).order('created_at', { ascending: false })),
    call(supabase.from('saved_posts').select('post_id').eq('user_id', meId).order('created_at', { ascending: false }).limit(4)),
  ]);
  const coverIds = [...new Set([...saved.map((r) => r.post_id), ...links.map((l) => l.post_id)])];
  const media = coverIds.length
    ? await call(supabase.from('post_media').select('post_id, kind, path, poster_path, position').in('post_id', coverIds))
    : [];
  const coverOf = (postId) => {
    const m = media.filter((x) => x.post_id === postId).sort((a, b) => a.position - b.position)[0];
    return m ? mediaUrl(m.kind === 'video' ? m.poster_path : m.path) : null;
  };
  const covers = (ids) => ids.map(coverOf).filter(Boolean).slice(0, 4);
  return {
    all: { count: null, covers: covers(saved.map((r) => r.post_id)) },
    folders: folders.map((f) => {
      const ids = links.filter((l) => l.folder_id === f.id).map((l) => l.post_id);
      return { id: f.id, name: f.name, count: ids.length, covers: covers(ids.slice(0, 4)) };
    }),
  };
}

export async function createFolder(name) {
  return call(supabase.from('save_folders').insert({ name: name.trim().slice(0, 60) }).select().single());
}

export function renameFolder(id, name) {
  return call(supabase.from('save_folders').update({ name: name.trim().slice(0, 60) }).eq('id', id));
}

export function deleteFolder(id) {
  return call(supabase.from('save_folders').delete().eq('id', id));
}

export async function getFolder(id) {
  return call(supabase.from('save_folders').select('*').eq('id', id).maybeSingle());
}

export async function listFolderPosts(folderId, meId) {
  const rows = await call(
    supabase.from('save_folder_posts').select('post_id').eq('folder_id', folderId).order('created_at', { ascending: false }),
  );
  return postsInOrder(rows.map((r) => r.post_id), meId);
}

// Which of my folders hold this post.
export async function foldersWithPost(meId, postId) {
  const rows = await call(supabase.from('save_folder_posts').select('folder_id').eq('user_id', meId).eq('post_id', postId));
  return rows.map((r) => r.folder_id);
}

// Put a post in (or take it out of) a folder. Adding also saves it.
export async function setInFolder(folderId, postId, on) {
  if (on) {
    await savePost(postId);
    return call(
      supabase.from('save_folder_posts').upsert({ folder_id: folderId, post_id: postId }, { onConflict: 'folder_id,post_id', ignoreDuplicates: true }),
    );
  }
  return call(supabase.from('save_folder_posts').delete().eq('folder_id', folderId).eq('post_id', postId));
}

// Link that opens a post in the app (after sign-in).
export const postLink = (id) => `https://scribblegolfclub.com/app/?post=${id}`;

export function reportPost(postId, reason) {
  return call(supabase.from('post_reports').insert({ post_id: postId, reason: reason?.slice(0, 500) ?? '' }));
}
