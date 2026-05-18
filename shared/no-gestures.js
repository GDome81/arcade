// ─────────────────────────────────────────────────────────────────────────────
// Suppress mobile-browser gestures that disrupt gameplay:
//   - pull-to-refresh (overscroll-behavior:none)
//   - pinch-zoom & gesture events (iOS)
//   - long-press context menu (except in form inputs)
//   - edge-swipe back gesture — only when the touch starts on a <canvas>,
//     so this script doesn't break scrolling or button taps on regular
//     pages like the launcher.
//
// Caveats: the browser still gets the final say. iOS Safari edge-swipe is
// only reliably disabled when launched as a PWA (standalone).
// ─────────────────────────────────────────────────────────────────────────────
(function(){
  if(window.__arcadeNoGesturesInstalled) return;
  window.__arcadeNoGesturesInstalled = true;

  // CSS — overscroll-behavior:none stops Chrome's pull-to-refresh and the
  // horizontal back-swipe glow. We intentionally DO NOT set touch-action:
  // none globally — that would kill vertical scrolling on the launcher's
  // long game list AND prevent button click events from firing. Games that
  // need to capture every touch already set touch-action:none on their own
  // canvas element.
  function installCSS(){
    const style = document.createElement('style');
    style.textContent = `
      html, body {
        overscroll-behavior: none;
        -webkit-overflow-scrolling: auto;
      }
    `;
    document.head.appendChild(style);
  }
  if(document.head) installCSS();
  else document.addEventListener('DOMContentLoaded', installCSS);

  // Edge-swipe guard — limited to touches that start on a <canvas>. This
  // covers all the games (they play inside a canvas) without interfering
  // with normal HTML buttons / scrollable lists on the launcher.
  const EDGE_PX = 32;
  document.addEventListener('touchstart', (e) => {
    if(!(e.target instanceof HTMLCanvasElement)) return;
    for(const t of e.changedTouches){
      if(t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX){
        e.preventDefault();
        return;
      }
    }
  }, { passive: false });

  // Block pinch-zoom gestures on iOS Safari.
  document.addEventListener('gesturestart',  e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  document.addEventListener('gestureend',    e => e.preventDefault());

  // Suppress the long-press context menu — but keep it on form controls
  // so text inputs still get their selection / paste menu.
  document.addEventListener('contextmenu', e => {
    const t = e.target;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
  });
})();
