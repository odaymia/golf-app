import { useEffect, useRef } from 'react';
import { setSound, useSound } from './feedSound.js';

// A feed video: plays (looping) while most of it is on screen, pauses when
// it scrolls or swipes away. Taps are handled by the post (sound / like).
export default function FeedVideo({ src, poster, onSize }) {
  const ref = useRef(null);
  const sound = useSound();

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.6) {
          v.play().catch(() => {
            // Browsers refuse autoplay with sound: fall back to muted.
            if (!v.muted) {
              setSound(false);
              v.muted = true;
              v.play().catch(() => {});
            }
          });
        } else v.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  // Keep the element's muted flag in step (React's `muted` prop only sets it once).
  useEffect(() => {
    if (ref.current) ref.current.muted = !sound;
  }, [sound]);

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => onSize?.(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
      />
      <span className="video-sound" aria-hidden="true">
        {sound ? (
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </span>
    </>
  );
}
