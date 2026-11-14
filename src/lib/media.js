// Prepare photos and videos on the phone before upload. Browser-only.

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that photo.'))), 'image/jpeg', quality),
  );
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Photos: shrink so the long side is at most `max` px, as JPEG. A 12 MB
// phone photo becomes ~300 KB and still looks sharp on a phone screen.
export async function prepareImage(file, max = 1440, quality = 0.82) {
  const bmp = await loadBitmap(file);
  const w = bmp.width;
  const h = bmp.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return { blob: await canvasToBlob(canvas, quality), width: canvas.width, height: canvas.height };
}

// Videos: keep the file, and grab a frame as the cover for the grid.
export async function prepareVideo(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error('That video format isn’t supported here.'));
    });
    video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    await new Promise((resolve) => {
      video.onseeked = resolve;
      setTimeout(resolve, 1500);
    });
    const max = 960;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale) || 640;
    canvas.height = Math.round(video.videoHeight * scale) || 640;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await canvasToBlob(canvas, 0.8);
    return { blob: file, poster, width: video.videoWidth, height: video.videoHeight, duration: video.duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function extFor(file) {
  if (file.type === 'video/quicktime') return 'mov';
  if (file.type === 'video/webm') return 'webm';
  if (file.type.startsWith('video/')) return 'mp4';
  return 'jpg';
}
