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
    // Analog mode needs a chunkier travel: with a 50 px knob and a 22 px
    // deadzone there's only 28 px of partial-magnitude range, which a
    // thumb crosses in one motion → the joystick ends up reading
    // full-speed 99% of the time. Bigger knob travel + smaller deadzone
    // restores the "how far I push = how fast it goes" feel.
    const deadzone = opts.deadzone || (analog ? 12 : 22);
    const KNOB_MAX = opts.knobMax || (analog ? 85 : 50);

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
        // Continuous magnitude: knob distance / KNOB_MAX, clamped to 1, then
        // remapped from the deadzone so the very-edge of the deadzone reads
        // as ~0 (no jump from 0 to a noticeable speed at the boundary).
        const span = Math.max(1, KNOB_MAX - deadzone);
        const mag  = Math.min(1, (dist - deadzone) / span);
        const ux   = dx / dist, uy = dy / dist;
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
          if(onStop && (lastDir.x !== 0 || lastDir.y !== 0)){
            lastDir = { x: 0, y: 0 };
            onStop();
          }
          return;
        }
      }
    }
    canvas.addEventListener('touchend',    endTouch, { passive: true });
    canvas.addEventListener('touchcancel', endTouch, { passive: true });
  }

  global.TouchDpad = { attach };
})(window);
