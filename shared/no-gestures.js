// ─────────────────────────────────────────────────────────────────────────────
// Suppress mobile-browser gestures that disrupt gameplay:
//   - pull-to-refresh (Chrome / Edge)
//   - edge-swipe back/forward navigation
//   - overscroll bounce / glow
//   - pinch-zoom & double-tap zoom
//   - context menu on long-press
//
// Caveats: the browser still gets the final say. iOS Safari edge-swipe is
// only reliably disabled when launched as a PWA (standalone). Chrome on
// Android responds to edge preventDefault if .passive: false — we set it.
// ─────────────────────────────────────────────────────────────────────────────
(function(){
  if(window.__arcadeNoGesturesInstalled) return;
  window.__arcadeNoGesturesInstalled = true;

  // CSS — overscroll-behavior:none + touch-action:none on the root so the
  // browser stops trying to scroll/refresh on any touch.
  function installCSS(){
    const style = document.createElement('style');
    style.textContent = `
      html, body {
        overscroll-behavior: none;
        -webkit-overflow-scrolling: auto;
        touch-action: none;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
    `;
    document.head.appendChild(style);
  }
  if(document.head) installCSS();
  else document.addEventListener('DOMContentLoaded', installCSS);

  // Edge guard: if any active touch starts inside EDGE_PX of the left or
  // right screen edge, preventDefault on every move/end too. That's the
  // origin zone where Android Chrome detects the back-swipe.
  const EDGE_PX = 32;
  const edgeTouches = new Set();
  function isEdge(t){
    return t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX;
  }
  document.addEventListener('touchstart', (e) => {
    for(const t of e.changedTouches){
      if(isEdge(t)) edgeTouches.add(t.identifier);
    }
    if(edgeTouches.size > 0) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if(edgeTouches.size > 0) e.preventDefault();
  }, { passive: false });
  function clearTouch(e){
    for(const t of e.changedTouches) edgeTouches.delete(t.identifier);
  }
  document.addEventListener('touchend',    clearTouch);
  document.addEventListener('touchcancel', clearTouch);

  // Block double-tap zoom on iOS via the classic "ignore the 2nd tap within
  // 300ms" trick. preventDefault on dblclick covers desktop.
  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if(now - lastTap < 300) e.preventDefault();
    lastTap = now;
  }, { passive: false });

  // Suppress the long-press context menu (right-click on desktop, hold on
  // mobile). Game inputs work on pointer/touch events; we don't need the
  // menu.
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Block pinch-zoom gestures on iOS.
  document.addEventListener('gesturestart',  e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  document.addEventListener('gestureend',    e => e.preventDefault());
})();
