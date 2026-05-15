// ─────────────────────────────────────────────────────────────────────────────
// Shared fullscreen toggle. Drop-in: just include this script from any page
// and it auto-injects a ⛶ button at top-right that toggles the browser
// Fullscreen API. Self-styled via inline styles so it doesn't depend on the
// host page's CSS, and idempotent (a 2nd include is a no-op).
//
// Position: top:8 right:8 — sits in the corner where most games leave room.
// Some HUDs (e.g. soccer-tap's AWAY score) live in the top-right area too,
// so the button stays small (36×36) + semi-translucent to minimise overlap.
// ─────────────────────────────────────────────────────────────────────────────
(function(){
  if(window.__arcadeFsInstalled) return;
  window.__arcadeFsInstalled = true;

  function isFs(){
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function toggle(){
    const el = document.documentElement;
    if(isFs()){
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if(exit) exit.call(document);
    } else {
      const enter = el.requestFullscreen || el.webkitRequestFullscreen;
      if(enter) enter.call(el).catch(() => {});
    }
  }
  function sync(){
    if(!btn) return;
    if(isFs()){
      btn.textContent = '⤡';
      btn.style.color = '#ffcc44';
      btn.style.borderColor = '#ffcc44';
      btn.style.boxShadow = '0 0 18px #ffcc4488';
      btn.title = 'Esci da schermo intero';
    } else {
      btn.textContent = '⛶';
      btn.style.color = '#00f5ff';
      btn.style.borderColor = 'rgba(0, 245, 255, 0.4)';
      btn.style.boxShadow = '0 0 14px rgba(0, 245, 255, 0.25)';
      btn.title = 'Schermo intero';
    }
  }

  const btn = document.createElement('button');
  btn.id = 'arcade-fs-btn';
  btn.type = 'button';
  Object.assign(btn.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'rgba(10, 20, 40, 0.55)',
    color: '#00f5ff',
    border: '1px solid rgba(0, 245, 255, 0.4)',
    fontFamily: 'Orbitron, sans-serif',
    fontWeight: '700',
    fontSize: '17px',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    pointerEvents: 'auto',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    boxShadow: '0 0 14px rgba(0, 245, 255, 0.25)',
    zIndex: '9999'
  });
  btn.addEventListener('click', toggle);

  function install(){
    if(!document.body) return;
    document.body.appendChild(btn);
    sync();
  }
  if(document.body) install();
  else document.addEventListener('DOMContentLoaded', install);

  document.addEventListener('fullscreenchange',       sync);
  document.addEventListener('webkitfullscreenchange', sync);
})();
