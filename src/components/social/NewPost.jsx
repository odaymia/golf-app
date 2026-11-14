import { useEffect, useRef, useState } from 'react';
import { createPost } from '../../lib/social.js';
import { courseTag, MAX_MEDIA, MAX_VIDEO_BYTES } from '../../lib/socialFormat.js';
import { listCourses } from '../../lib/storage.js';
import CourseSearch from '../CourseSearch.jsx';

// Share photos/videos with a caption and an optional course tag.
export default function NewPost({ meId, onPosted, onCancel }) {
  const [files, setFiles] = useState([]); // { file, url, kind }
  const [caption, setCaption] = useState('');
  const [course, setCourse] = useState(null);
  const [saved, setSaved] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const input = useRef(null);

  useEffect(() => {
    listCourses()
      .then(setSaved)
      .catch(() => {});
  }, []);

  // Free the preview URLs when leaving.
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  function addFiles(list) {
    setError('');
    const picked = [...list].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    const big = picked.find((f) => f.type.startsWith('video/') && f.size > MAX_VIDEO_BYTES);
    if (big) setError(`“${big.name}” is over 50 MB. Trim it to a shorter clip.`);
    const ok = picked.filter((f) => f !== big);
    setFiles((prev) =>
      [...prev, ...ok.map((file) => ({ file, url: URL.createObjectURL(file), kind: file.type.startsWith('video/') ? 'video' : 'image' }))].slice(
        0,
        MAX_MEDIA,
      ),
    );
  }

  function removeFile(i) {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });
  }

  async function share() {
    if (!files.length && !caption.trim()) return setError('Add a photo, a video or some words.');
    setError('');
    setProgress({ done: 0, total: files.length });
    try {
      await createPost({
        userId: meId,
        caption,
        course: courseTag(course),
        files: files.map((f) => f.file),
        onProgress: (done, total) => setProgress({ done, total }),
      });
      onPosted();
    } catch (e) {
      setError(e.message);
      setProgress(null);
    }
  }

  const busy = progress != null;
  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <h1>New post</h1>
        <button className="btn btn-ghost" onClick={share} disabled={busy}>
          Share
        </button>
      </div>

      <section className="card">
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {files.length === 0 ? (
          <button className="pick-media" onClick={() => input.current.click()} disabled={busy}>
            <span className="pick-icon">＋</span>
            <strong>Add photos or videos</strong>
            <span className="muted">Up to {MAX_MEDIA}. Videos up to 50 MB.</span>
          </button>
        ) : (
          <div className="new-media">
            {files.map((f, i) => (
              <div key={f.url} className="new-thumb">
                {f.kind === 'video' ? <video src={f.url} muted playsInline preload="metadata" /> : <img src={f.url} alt="" />}
                {f.kind === 'video' && <span className="grid-badge">▶</span>}
                <button className="thumb-remove" onClick={() => removeFile(i)} disabled={busy} aria-label="Remove">
                  ✕
                </button>
              </div>
            ))}
            {files.length < MAX_MEDIA && (
              <button className="new-thumb add-more" onClick={() => input.current.click()} disabled={busy} aria-label="Add more">
                ＋
              </button>
            )}
          </div>
        )}
        <label className="field">
          <span>Caption</span>
          <textarea
            className="caption-input"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="How was the round?"
            maxLength={2200}
            rows={3}
            disabled={busy}
          />
        </label>
      </section>

      <section className="card">
        <h3>📍 Tag a course</h3>
        {course ? (
          <div className="tagged">
            <div>
              <strong>{course.name}</strong>
              <span className="muted">{course.place}</span>
            </div>
            <button className="btn btn-ghost btn-small" onClick={() => setCourse(null)} disabled={busy}>
              Remove
            </button>
          </div>
        ) : (
          <>
            <CourseSearch onPick={({ course: c }) => setCourse(c)} />
            {saved.length > 0 && (
              <div className="chips">
                {saved.slice(0, 6).map((c) => (
                  <button key={c.id} className="chip" onClick={() => setCourse(c)}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <p className="hint">Tagged posts show up on the course&apos;s page, so golfers can see current conditions.</p>
          </>
        )}
      </section>

      {error && <div className="card error-box">{error}</div>}
      <button className="btn btn-primary btn-xl" onClick={share} disabled={busy}>
        {busy ? (progress.total ? `Uploading ${progress.done} of ${progress.total}…` : 'Posting…') : 'Share'}
      </button>
    </div>
  );
}
