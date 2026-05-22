// ─────────────────────────────────────────────────────────────────────────────
// SHARED TOUCH DPAD — virtual joystick used by every 4-direction game.
//
// Replaces the cluster-of-4-buttons dpad that's awkward on mobile. On any
// touchstart inside the canvas, a joystick base anchors at the touch point;
// while the finger drags, the direction is computed and snapped to the
// dominant cardinal axis. `onDirection({x,y})` is called whenever the snapped
// direction changes. When the finger lifts, the joystick disappears.
//
// Usage:
//   TouchDpad.attach({ canvas, onDirection: ({x,y}) => setDir(x, y) });
//
// Activates ONLY on touch events, so desktop mouse input is untouched and
// keyboard handlers still work in parallel.
// ─────────────────────────────────────────────────────────────────────────────
(function(global){
  function attach(opts){
    const canvas   = opts.canvas;
    const onDir    = opts.onDirection;
    const onStop   = opts.onStop;          // optional: called with no args on release / deadzone (for held-direction games)
    const analog     = !!opts.analog;         // continuous (x, y) in [-1, 1] — magnitude scales with knob distance
    const eightWay   = !!opts.eightWay;       // both axes simultaneously, 8 sectors
    const sixteenWay = !!opts.sixteenWay;     // both axes simultaneously, 16 sectors (22.5° resolution)
    // Analog mode decouples the VISUAL knob travel (KNOB_MAX) from the
    // MATHEMATICAL magnitude range (ANALOG_RANGE). The previous code
    // tied them together at 85 px — but a thumb easily drags past 85 in
    // one motion, so the magnitude saturated to 1 almost immediately and
    // the joystick effectively had two states: deadzone or full speed.
    // Now the math uses a much wider range (160 px by default) so the
    // realistic 50–150 px of thumb sweep covers the whole 0→1 curve.
    const deadzone = opts.deadzone || (analog ? 10 : 22);
    // Analog visual knob caps at 80 px so the on-screen knob position
    // mirrors the magnitude curve below (80 px → 100 % speed).
    const KNOB_MAX = opts.knobMax  || (analog ? 80 : 50);
    // Magnitude curve is piecewise so partial inputs feel deliberate:
    //   10 → 0   (deadzone edge)
    //   25 → 0.10  (delicate)
    //   50 → 0.60  (medium)
    //   80 → 1.00  (max)
    //  >80 → 1.00 (clamp)
    // Tightened from the original 30/65/100 breakpoints — the physical
    // gamepad reaches full speed instantly at full deflection, but a
    // thumb intuitively drags only ~70-80 px, so the touch joystick
    // felt notably slower at max. 80 px = 100 % closes that gap.
    const ANALOG_STOPS = opts.analogCurve || [
      [10, 0.00], [25, 0.10], [50, 0.60], [80, 1.00]
    ];
    function magForDist(d){
      if(d <= ANALOG_STOPS[0][0]) return 0;
      for(let i = 1; i < ANALOG_STOPS.length; i++){
        const [da, ma] = ANALOG_STOPS[i - 1];
        const [db, mb] = ANALOG_STOPS[i];
        if(d <= db) return ma + (d - da) / (db - da) * (mb - ma);
      }
      return 1;
    }

    // Build the joystick UI once and reuse across touches
    const base = document.createElement('div');
    const knob = document.createElement('div');
    base.className = 'td-base';
    knob.className = 'td-knob';
    document.body.appendChild(base);
    document.body.appendChild(knob);

    let touchId = null;
    let originX = 0, originY = 0;
    let lastDir = { x: 0, y: 0 };

    function show(x, y){
      base.style.display = 'block';
      base.style.left = (x - 65) + 'px';
      base.style.top  = (y - 65) + 'px';
      knob.style.display = 'block';
      knob.style.left = (x - 27) + 'px';
      knob.style.top  = (y - 27) + 'px';
    }
    function moveKnob(dx, dy){
      const d = Math.hypot(dx, dy);
      const kx = d > KNOB_MAX ? (dx / d) * KNOB_MAX : dx;
      const ky = d > KNOB_MAX ? (dy / d) * KNOB_MAX : dy;
      knob.style.left = (originX + kx - 27) + 'px';
      knob.style.top  = (originY + ky - 27) + 'px';
    }
    function hide(){
      base.style.display = 'none';
      knob.style.display = 'none';
    }
    // Lookup table for the 8-sector partition: index 0=right, then walks
    // clockwise (canvas Y is down) through down-right, down, down-left,
    // left, up-left, up, up-right.
    const EIGHT_DIRS = [
      [ 1,  0], [ 1,  1], [ 0,  1], [-1,  1],
      [-1,  0], [-1, -1], [ 0, -1], [ 1, -1]
    ];
    // 16-sector partition — same starting axis, but two extra directions
    // between each cardinal/diagonal so the joystick reads movement at
    // 22.5° resolution. Vectors are unit-length (cos/sin) — callers that
    // care about a normalised direction should re-divide by the
    // magnitude, but the soccer code already does that since it always
    // re-normalises joyVec anyway.
    const SIXTEEN_DIRS = (function(){
      const out = [];
      for(let i = 0; i < 16; i++){
        const a = (i * Math.PI * 2) / 16;
        // Round near-zero components so the cardinals stay exactly axis-aligned.
        const cx = Math.cos(a), cy = Math.sin(a);
        out.push([Math.abs(cx) < 1e-9 ? 0 : cx, Math.abs(cy) < 1e-9 ? 0 : cy]);
      }
      return out;
    })();

    function apply(dx, dy){
      const dist = Math.hypot(dx, dy);
      if(dist < deadzone){
        if((lastDir.x !== 0 || lastDir.y !== 0) && onStop){
          lastDir = { x: 0, y: 0 };
          onStop();
        }
        return;
      }
      let nx = 0, ny = 0;
      if(analog){
        // Magnitude is the piecewise curve magForDist(dist). Visual knob
        // caps at KNOB_MAX (matches the 100-px max-speed point) so the
        // on-screen position mirrors how hard you're pushing.
        const ux = dx / dist, uy = dy / dist;
        const mag = magForDist(dist);
        nx = ux * mag;
        ny = uy * mag;
        // Always emit in analog (we want every frame's nudge to reach the game).
        lastDir = { x: nx, y: ny };
        onDir(lastDir);
        return;
      }
      if(sixteenWay){
        // 16 sectors of 22.5° each — partition the circle so a finger at
        // any angle within 11.25° of a target direction snaps to it.
        const ang  = Math.atan2(dy, dx);
        const deg  = (ang * 180 / Math.PI + 360) % 360;
        const sect = Math.floor((deg + 11.25) / 22.5) % 16;
        [nx, ny] = SIXTEEN_DIRS[sect];
      } else if(eightWay){
        // 8-way: partition the unit circle into 8 sectors of 45° centred on
        // each direction (right → 0°±22.5°, down-right → 45°±22.5°, etc.)
        // and pick whichever the touch angle lands in. This makes a finger
        // at ANY angle within 22.5° of a diagonal trigger that diagonal,
        // which is what mobile players intuitively expect.
        const ang  = Math.atan2(dy, dx);                   // -π..π
        const deg  = (ang * 180 / Math.PI + 360) % 360;    // 0..360
        const sect = Math.floor((deg + 22.5) / 45) % 8;
        [nx, ny] = EIGHT_DIRS[sect];
      } else {
        // Snap to cardinal axis with the larger magnitude.
        if(Math.abs(dx) > Math.abs(dy)) nx = dx > 0 ?  1 : -1;
        else                            ny = dy > 0 ?  1 : -1;
      }
      // For 16-way the floating-point compare needs a tolerance — small
      // FP drift would otherwise re-fire onDir every frame.
      if(Math.abs(nx - lastDir.x) < 1e-6 && Math.abs(ny - lastDir.y) < 1e-6) return;
      lastDir = { x: nx, y: ny };
      onDir(lastDir);
    }

    canvas.addEventListener('touchstart', function(e){
      if(touchId !== null) return;
      const t = e.changedTouches[0];
      if(!t) return;
      touchId = t.identifier;
      originX = t.clientX; originY = t.clientY;
      lastDir = { x: 0, y: 0 };
      show(originX, originY);
    }, { passive: true });

    canvas.addEventListener('touchmove', function(e){
      for(const t of e.changedTouches){
        if(t.identifier === touchId){
          const dx = t.clientX - originX;
          const dy = t.clientY - originY;
          moveKnob(dx, dy);
          apply(dx, dy);
          return;
        }
      }
    }, { passive: true });

    function endTouch(e){
      for(const t of e.changedTouches){
        if(t.identifier === touchId){
          touchId = null;
          hide();
          // ALWAYS fire onStop on release, even if lastDir happened to be
          // zero (a tap-without-drag in analog mode, for example). Skipping
          // it leaves the caller's joyVec stuck at the previous non-zero
          // value, which was blocking the gamepad branch from taking over
          // in pong ("la barretta si blocca col joypad fisico").
          lastDir = { x: 0, y: 0 };
          if(onStop) onStop();
          return;
        }
      }
    }
    canvas.addEventListener('touchend',    endTouch, { passive: true });
    canvas.addEventListener('touchcancel', endTouch, { passive: true });
  }

  global.TouchDpad = { attach };
})(window);
