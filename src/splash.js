// The loading page (#splash in app/index.html) shows the moment the app
// opens. hideSplash() fades it out once the first real screen is ready,
// but not before MIN_MS, so it never just flickers.
const MIN_MS = 900;
let hidden = false;

export function hideSplash() {
  if (hidden) return;
  hidden = true;
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, MIN_MS - performance.now());
  setTimeout(() => {
    el.classList.add('gone');
    setTimeout(() => el.remove(), 500);
  }, wait);
}

// Never leave someone stuck on the loading page (slow network, an error).
setTimeout(hideSplash, 8000);
