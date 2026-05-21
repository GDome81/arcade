// ─────────────────────────────────────────────────────────────────────────────
// Shared pause module. Drop-in: include this script from any game, then
// register the game's pause/resume callbacks:
//
//   if(window.Pause){
//     Pause.attach({
//       onPause:  () => { running = false; },
//       onResume: () => { running = true; lastT = performance.now();
//                         requestAnimationFrame(loop); },
//       // Optional — return false to make clicking the button a no-op
//       // (e.g. while on the menu / game-over screen).
//       canPause: () => phase === 'playing'
//     });
//   }
//
// The module auto-injects a ⏸ button at top-right (beside the fullscreen
// button) and a full-screen RESUME overlay. Idempotent: a second include
// is a no-op. Auto-pauses when the tab is hidden (so leaving the browser
// and coming back doesn't lose state); auto-resume on tab focus is left
// to the game (some games show their own resume confirmation).
//
// The module DOES NOT decide whether the game's update loop runs — the
// game's onPause callback is responsible for that. This keeps the module
// drop-in across very different loop architectures.
// ─────────────────────────────────────────────────────────────────────────────
(function(){
  if(window.__arcadePauseInstalled) return;
  window.__arcadePauseInstalled = true;

  let paused = false;
  let opts = { onPause: null, onResume: null, canPause: () => true };

  const btn = document.createElement('button');
  btn.id = 'arcade-pause-btn';
  btn.type = 'button';
  btn.textContent = '⏸';
  Object.assign(btn.style, {
    position: 'fixed',
    top: '52px',                                // stacked below the ⛶ fullscreen button so we don't cut into the top HUD chips
    right: '8px',
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'rgba(10, 20, 40, 0.55)',
    color: '#ffcc44',
    border: '1px solid rgba(255, 204, 68, 0.45)',
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
    boxShadow: '0 0 14px rgba(255, 204, 68, 0.30)',
    zIndex: '9998'                              // one less than fullscreen so the icons don't overlap
  });
  btn.title = 'Pausa';

  // Full-screen overlay shown while paused. A single big RESUME button +
  // a translucent backdrop. Tapping the backdrop also resumes (forgiving).
  const overlay = document.createElement('div');
  overlay.id = 'arcade-pause-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(5, 8, 16, 0.78)',
    backdropFilter: 'blur(4px)',
    display: 'none',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '18px',
    zIndex: '9997',
    pointerEvents: 'auto',
    color: '#fff',
    fontFamily: 'Orbitron, sans-serif'
  });
  const h = document.createElement('div');
  h.textContent = 'PAUSA';
  Object.assign(h.style, {
    fontWeight: '900',
    fontSize: '2.1rem',
    letterSpacing: '.22em',
    color: '#ffcc44',
    textShadow: '0 0 28px #ffcc44'
  });
  const resumeBtn = document.createElement('button');
  resumeBtn.type = 'button';
  resumeBtn.textContent = '▶ RIPRENDI';
  Object.assign(resumeBtn.style, {
    padding: '12px 28px',
    background: 'transparent',
    border: '2px solid #ffcc44',
    color: '#ffcc44',
    fontFamily: 'Orbitron, sans-serif',
    fontWeight: '700',
    fontSize: '.95rem',
    letterSpacing: '.22em',
    cursor: 'pointer',
    textTransform: 'uppercase',
    boxShadow: '0 0 22px #ffcc4455'
  });
  const hint = document.createElement('div');
  hint.textContent = 'Tocca lo sfondo per riprendere';
  Object.assign(hint.style, {
    fontFamily: '"Share Tech Mono", monospace',
    fontSize: '.78rem',
    letterSpacing: '.14em',
    color: '#a0b0c8'
  });
  overlay.appendChild(h);
  overlay.appendChild(resumeBtn);
  overlay.appendChild(hint);

  function setPaused(v){
    if(v === paused) return;
    if(v && !opts.canPause()) return;           // refuse pause on menus / game-over
    paused = v;
    if(paused){
      overlay.style.display = 'flex';
      btn.textContent = '▶';
      btn.title = 'Riprendi';
      try { opts.onPause && opts.onPause(); } catch(e){}
    } else {
      overlay.style.display = 'none';
      btn.textContent = '⏸';
      btn.title = 'Pausa';
      try { opts.onResume && opts.onResume(); } catch(e){}
    }
  }

  btn.addEventListener('click', e => { e.preventDefault(); setPaused(!paused); });
  resumeBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); setPaused(false); });
  overlay.addEventListener('click', e => {
    // Tapping the overlay (anywhere except the resume button) resumes too.
    if(e.target === overlay) setPaused(false);
  });

  // Auto-pause when the tab is hidden — coming back from another app
  // shouldn't drop you into the middle of a fight that ticked while
  // you were gone. We DO NOT auto-resume on visibility return: the user
  // taps the overlay or the pause button to confirm they're ready.
  document.addEventListener('visibilitychange', () => {
    if(document.hidden && !paused) setPaused(true);
  });

  // Keyboard: Esc and P toggle pause.
  window.addEventListener('keydown', e => {
    if(e.repeat) return;
    if(e.code === 'Escape' || e.code === 'KeyP'){
      e.preventDefault();
      setPaused(!paused);
    }
  });

  function install(){
    if(!document.body) return;
    document.body.appendChild(overlay);
    document.body.appendChild(btn);
  }
  if(document.body) install();
  else document.addEventListener('DOMContentLoaded', install);

  window.Pause = {
    attach(o){
      opts = Object.assign({ canPause: () => true }, opts, o || {});
    },
    toggle(){ setPaused(!paused); },
    set(v){ setPaused(!!v); },
    isPaused(){ return paused; }
  };
})();
