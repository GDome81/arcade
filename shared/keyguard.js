// ─────────────────────────────────────────────────────────────────────────────
// KEYGUARD — suppress browser-default actions for keys that bluetooth pads in
// "keyboard mode" tend to emit. Game listeners still see the event because we
// only call preventDefault() (no stopPropagation); the browser just doesn't
// scroll, navigate back, exit, etc.
//
// Loads BEFORE any game script so it runs in the capture phase and beats
// every other handler to the punch.
//
// Note: OS-level shortcuts like Ctrl+W / Cmd+W can't be intercepted from web
// content — if a controller is still sending those, the user needs to switch
// the controller into HID gamepad mode (usually Home+X held for ~3 s on
// ShanWan-style pads).
// ─────────────────────────────────────────────────────────────────────────────
(function(){
  const BLOCK = new Set([
    // Page navigation / scroll
    'Backspace', 'Tab',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    ' ', 'Space',
    'Home', 'End', 'PageUp', 'PageDown',
    // Browser feature keys often emitted by weird controller mappings
    'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
    'BrowserBack', 'BrowserForward', 'BrowserRefresh', 'BrowserStop',
    'BrowserHome', 'BrowserSearch', 'BrowserFavorites',
    'MediaPlayPause','MediaPause','MediaPlay',
    'MediaTrackNext','MediaTrackPrevious','MediaStop',
    'AudioVolumeMute','AudioVolumeUp','AudioVolumeDown',
    'LaunchApplication1','LaunchApplication2','LaunchMail',
    // Slash characters open quick-find in some browsers
    '/', '?'
  ]);
  function block(e){
    const t = e.target;
    // Don't fight typed inputs — nicknames, leaderboard search, etc.
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if(BLOCK.has(e.key)) e.preventDefault();
  }
  // Capture-phase listener so we beat every other game handler.
  window.addEventListener('keydown', block, { capture: true });
  window.addEventListener('keyup',   block, { capture: true });
})();
