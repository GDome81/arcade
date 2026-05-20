// ─────────────────────────────────────────────────────────────────────────────
// SHARED GAMEPAD — thin wrapper around the browser's Gamepad API. Polls at
// 60 Hz, normalises the first connected pad into a single state object that
// games can read each frame.
//
// Standard mapping (Xbox layout):
//   Buttons: 0=A 1=B 2=X 3=Y · 4=L1 5=R1 · 6=L2 7=R2 ·
//            8=Select 9=Start · 10=L3 11=R3 · 12-15=D-pad U/D/L/R
//   Axes:    0/1 = left stick X/Y · 2/3 = right stick X/Y
//
// `state()` returns:
//   dir       {x,y}   8-way snapped direction (left stick OR d-pad)
//   stickL    {x,y}   raw left-stick analog values (-1..1)
//   stickR    {x,y}   raw right-stick analog values
//   fire      bool    A button or R2 trigger
//   action    bool    X button
//   cancel    bool    B button
//   menu      bool    Y button
//   start     bool    Start button (9)
//   back      bool    Select button (8)
//   buttons   bool[]  raw button pressed flags
//
// `justPressed(idx)` / `justReleased(idx)` — edge detection across one frame.
// `isConnected()`   — true while a gamepad is reporting.
//
// IMPORTANT: the controller must be in HID gamepad mode, not keyboard mode.
// On most ShanWan/Backbone-style controllers: hold Home + X for ~3 s to
// switch. In keyboard mode the OS routes button presses as key events
// (which can close the tab) and the Gamepad API sees nothing.
// ─────────────────────────────────────────────────────────────────────────────
(function(global){
  if(global.GamepadInput) return;

  const STATE = {
    dir:    { x: 0, y: 0 },
    stickL: { x: 0, y: 0 },
    stickR: { x: 0, y: 0 },
    fire: false, action: false, cancel: false, menu: false,
    start: false, back: false,
    buttons: [],
    axes: [],
    id: null
  };

  let connected      = false;
  let prevButtons    = [];
  const justPressedSet  = new Set();
  const justReleasedSet = new Set();

  // 8-way directions, clockwise from "right" with canvas Y pointing down.
  const DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const DEAD = 0.28;

  function pickPad(){
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for(const p of pads){ if(p && p.connected) return p; }
    return null;
  }

  function poll(){
    const pad = pickPad();
    if(!pad){
      if(connected){
        connected = false;
        STATE.id = null;
        STATE.dir.x = STATE.dir.y = 0;
        STATE.stickL.x = STATE.stickL.y = STATE.stickR.x = STATE.stickR.y = 0;
        STATE.fire = STATE.action = STATE.cancel = STATE.menu = false;
        STATE.start = STATE.back = false;
        STATE.buttons = []; STATE.axes = [];
        prevButtons = [];
        justPressedSet.clear(); justReleasedSet.clear();
      }
      return;
    }
    if(!connected){ connected = true; STATE.id = pad.id; }

    // Sticks — keep raw analog for games that want fine control.
    STATE.stickL.x = pad.axes[0] || 0;
    STATE.stickL.y = pad.axes[1] || 0;
    STATE.stickR.x = pad.axes[2] || 0;
    STATE.stickR.y = pad.axes[3] || 0;
    STATE.axes = pad.axes.slice();

    // 8-way snapped direction — stick if outside deadzone, else d-pad.
    let dx = 0, dy = 0;
    if(Math.hypot(STATE.stickL.x, STATE.stickL.y) >= DEAD){
      const ang  = Math.atan2(STATE.stickL.y, STATE.stickL.x);
      const deg  = (ang * 180 / Math.PI + 360) % 360;
      const sect = Math.floor((deg + 22.5) / 45) % 8;
      dx = DIRS[sect][0]; dy = DIRS[sect][1];
    } else {
      const b = pad.buttons;
      if(b[12] && b[12].pressed) dy = -1;
      if(b[13] && b[13].pressed) dy = +1;
      if(b[14] && b[14].pressed) dx = -1;
      if(b[15] && b[15].pressed) dx = +1;
    }
    STATE.dir.x = dx; STATE.dir.y = dy;

    // Named buttons (Xbox layout). A is the bottom face, B is right, X is
    // left, Y is top — the most common mobile pad convention.
    const b = pad.buttons;
    STATE.buttons = b.map(x => !!(x && x.pressed));
    STATE.fire    = !!(b[0] && b[0].pressed) || !!(b[7] && b[7].pressed);
    STATE.action  = !!(b[2] && b[2].pressed);
    STATE.cancel  = !!(b[1] && b[1].pressed);
    STATE.menu    = !!(b[3] && b[3].pressed);
    STATE.start   = !!(b[9] && b[9].pressed);
    STATE.back    = !!(b[8] && b[8].pressed);

    // Edge detection.
    justPressedSet.clear();
    justReleasedSet.clear();
    for(let i = 0; i < b.length; i++){
      const wasDown = prevButtons[i] || false;
      const isDown  = !!(b[i] && b[i].pressed);
      if(isDown && !wasDown) justPressedSet.add(i);
      if(!isDown && wasDown) justReleasedSet.add(i);
      prevButtons[i] = isDown;
    }
  }

  // Auto-poll every animation frame so games can just read STATE.
  function tick(){ poll(); requestAnimationFrame(tick); }
  requestAnimationFrame(tick);

  global.GamepadInput = {
    state(){ return STATE; },
    isConnected(){ return connected; },
    justPressed:  i => justPressedSet.has(i),
    justReleased: i => justReleasedSet.has(i)
  };
})(window);
