// iOS 26 bug: in home-screen web apps the browser sometimes keeps a wrong
// viewport height (often after the keyboard was open), so bars pinned with
// `position: fixed; bottom: 0` (the bottom menu, the score keypad) float
// mid-screen and move with scrolling. We measure where "bottom: 0" really
// lands against the visible area (visualViewport) and set --vv-shift, which
// those bars add as a translateY. Normal browsers get 0.

// How far a bottom-pinned bar must move down (+) or up (-) to sit on the
// visible bottom edge. All values in the page's client coordinates.
export function bottomShift({ vvTop, vvHeight, probeBottom, typing }) {
  if (typing || !Number.isFinite(vvHeight) || !Number.isFinite(probeBottom)) return 0;
  const shift = Math.round(vvTop + vvHeight - probeBottom);
  return Math.abs(shift) < 2 ? 0 : shift;
}

const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !/^(button|checkbox|radio|submit|range|color|file)$/i.test(el.type)) || el.isContentEditable);
};

export function installViewportFix() {
  const vv = window.visualViewport;
  if (!vv || typeof document === 'undefined') return;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  let frame = 0;
  let last = 0;
  const update = () => {
    frame = 0;
    const shift = bottomShift({ vvTop: vv.offsetTop, vvHeight: vv.height, probeBottom: probe.getBoundingClientRect().bottom, typing: isTyping() });
    if (shift !== last) {
      last = shift;
      document.documentElement.style.setProperty('--vv-shift', `${shift}px`);
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  // After the keyboard closes the viewport settles a moment later.
  document.addEventListener('focusout', () => setTimeout(schedule, 350));
  document.addEventListener('visibilitychange', schedule);
  schedule();
}
