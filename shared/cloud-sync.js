// ─────────────────────────────────────────────────────────────────────────────
// CloudSync — persists per-device state (coin balance + per-game stats) in
// Firestore so the player keeps their progress across page reloads and tabs.
//
// Storage layout (single doc per device, keyed by the existing deviceId):
//
//   devices/<deviceId> = {
//     deviceId,
//     name,                      // denormalised current nickname
//     coins,                     // global coin balance (paid mode only)
//     createdAt, lastSeen,
//     games: {
//       <gameId>: {
//         bestScore,             // max score ever submitted from this device
//         plays,                 // total play count (incremented on boot)
//         lastPlayed,            // server timestamp of the most recent visit
//         coinsEarned            // running total of coins won in this game
//       },
//       ...
//     }
//   }
//
// The CloudSync API is the single point of contact games use:
//
//   CloudSync.ready()                  → Promise that resolves when boot is done
//   CloudSync.state()                  → last-known remote doc (or null)
//   CloudSync.recordPlay(gameId)       → bumps plays + lastPlayed
//   CloudSync.recordScore(gameId, n)   → updates bestScore (only if better)
//                                        AND pushes a public leaderboard entry
//   CloudSync.recordCoinsEarned(gameId, n)  → bumps the per-game coin counter
//   CloudSync.flush()                  → force-flush dirty writes
//
// Constraints / quirks worth remembering:
//   • Cloud sync is GATED on Coins.mode === 'paid'. In free / infinite /
//     powerapp mode we don't touch the cloud (those modes are ephemeral).
//   • Coin reconciliation is "max wins": on boot we take max(local, cloud)
//     so the player is never penalised by a stale sync.
//   • Per-game writes are debounced (5s) and also flushed on pagehide so
//     coin spikes don't burn through the Firestore write quota.
// ─────────────────────────────────────────────────────────────────────────────
(function(global){
  if(global.CloudSync) return;

  const COLLECTION   = 'devices';
  const FLUSH_DELAY  = 5000;   // ms debounce on coin writes
  let cloudState     = null;   // last-known remote doc (or null if missing)
  let bootPromise    = null;
  let bootResolve    = null;
  let bootDone       = false;
  let coinDirty      = false;  // pending coin write — value taken at flush time
  let flushTimer     = null;
  let syncingFromCloud = false; // suppress coin-change push when echoing cloud

  bootPromise = new Promise(res => { bootResolve = res; });

  // ── helpers ─────────────────────────────────────────────────────────────
  function isPaid(){
    return global.Coins && global.Coins.mode === 'paid' && !global.Coins.bridgeActive;
  }
  function isFsReady(){
    return !!(global.firebase && global.firebase.firestore && global.Track && global.Track.deviceId);
  }
  function deviceRef(){
    return global.firebase.firestore().collection(COLLECTION).doc(global.Track.deviceId());
  }
  function ts(){
    return global.firebase.firestore.FieldValue.serverTimestamp();
  }
  function inc(n){
    return global.firebase.firestore.FieldValue.increment(n);
  }
  function gameId(){
    return (global.Track && global.Track.gameId && global.Track.gameId()) || null;
  }
  function whenFs(timeout){
    return new Promise(resolve => {
      const t0 = Date.now();
      const i  = setInterval(() => {
        if(isFsReady()){ clearInterval(i); resolve(true); }
        else if(Date.now() - t0 > (timeout || 6000)){ clearInterval(i); resolve(false); }
      }, 80);
    });
  }
  function logErr(label, e){ try { console.warn('[CloudSync] ' + label, e); } catch(_) {} }

  // ── boot: pull, reconcile coins, register this play ─────────────────────
  async function boot(){
    if(!await whenFs()){ bootDone = true; bootResolve(); return; }
    try {
      const snap = await deviceRef().get();
      cloudState = snap.exists ? snap.data() : null;
    } catch(e){
      logErr('initial pull failed', e);
      cloudState = null;
    }

    // Reconcile coin balance (paid mode only).
    if(isPaid() && cloudState && typeof cloudState.coins === 'number'){
      const local  = Number(global.Coins.balance) || 0;
      const remote = Number(cloudState.coins) || 0;
      if(remote > local){
        syncingFromCloud = true;
        try { global.Coins.add(remote - local, 'cloud-sync'); } catch(e){}
        syncingFromCloud = false;
      } else if(local > remote){
        coinDirty = true;
        scheduleFlush();
      }
    } else if(isPaid()){
      // No remote state yet — seed it with what we have locally.
      const local = Number(global.Coins.balance) || 0;
      if(local > 0){
        coinDirty = true;
        scheduleFlush();
      }
    }

    bootDone = true;
    bootResolve();

    // Record this page as a play (if we're inside a game, not the launcher).
    const gid = gameId();
    if(gid && gid !== 'launcher') recordPlay(gid);
  }

  // ── coin sync (debounced) ───────────────────────────────────────────────
  function scheduleFlush(){
    if(flushTimer) return;
    flushTimer = setTimeout(flushCoins, FLUSH_DELAY);
  }
  async function flushCoins(){
    if(flushTimer){ clearTimeout(flushTimer); flushTimer = null; }
    if(!coinDirty) return;
    if(!isPaid()){ coinDirty = false; return; }
    if(!await whenFs()) return;
    // Always read the LIVE balance at flush time, not the value captured
    // when the flush was scheduled — otherwise a reconcile that lands
    // between scheduling and flushing would push the stale value back.
    const value = Number(global.Coins.balance) || 0;
    coinDirty = false;
    try {
      await deviceRef().set({
        deviceId: global.Track.deviceId(),
        name:     (global.Profile && global.Profile.name) || '',
        coins:    Math.max(0, Math.min(999999, Math.floor(value))),
        lastSeen: ts()
      }, { merge: true });
    } catch(e){
      logErr('flushCoins failed', e);
    }
  }

  // Listen to coin changes so we know when to push.
  global.addEventListener('coins:change', () => {
    if(!isPaid()) return;
    if(syncingFromCloud) return;
    coinDirty = true;
    scheduleFlush();
  });

  // ── per-game writers ────────────────────────────────────────────────────
  async function recordPlay(gid){
    gid = gid || gameId();
    if(!gid || gid === 'launcher') return;
    if(!await whenFs()) return;
    try {
      const update = {
        deviceId: global.Track.deviceId(),
        name:     (global.Profile && global.Profile.name) || '',
        lastSeen: ts()
      };
      update['games.' + gid + '.lastPlayed'] = ts();
      update['games.' + gid + '.plays']      = inc(1);
      await deviceRef().set({ deviceId: global.Track.deviceId() }, { merge: true });
      await deviceRef().update(update);
    } catch(e){
      logErr('recordPlay failed', e);
    }
  }

  async function recordScore(gid, score){
    gid = gid || gameId();
    if(!gid || gid === 'launcher') return;
    const n = Number(score);
    if(!Number.isFinite(n) || n < 0) return;

    // Always submit to the public leaderboard (one row per attempt).
    try {
      if(global.Scores && global.Scores.submit){
        global.Scores.submit(gid, n);
      }
    } catch(e){ logErr('Scores.submit failed', e); }

    // Update the device's per-game best (only if it's actually better).
    if(!await whenFs()) return;
    try {
      const snap = await deviceRef().get();
      const data = snap.exists ? (snap.data() || {}) : {};
      const games = data.games || {};
      const prev  = games[gid] || {};
      if(typeof prev.bestScore === 'number' && prev.bestScore >= n) return;
      const update = {
        deviceId: global.Track.deviceId(),
        lastSeen: ts()
      };
      update['games.' + gid + '.bestScore']  = Math.floor(n);
      update['games.' + gid + '.lastPlayed'] = ts();
      await deviceRef().set({ deviceId: global.Track.deviceId() }, { merge: true });
      await deviceRef().update(update);
    } catch(e){
      logErr('recordScore best update failed', e);
    }
  }

  async function recordCoinsEarned(gid, n){
    gid = gid || gameId();
    if(!gid || gid === 'launcher') return;
    n = Number(n);
    if(!Number.isFinite(n) || n <= 0) return;
    if(!await whenFs()) return;
    try {
      const update = {
        deviceId: global.Track.deviceId(),
        lastSeen: ts()
      };
      update['games.' + gid + '.coinsEarned'] = inc(Math.floor(n));
      await deviceRef().set({ deviceId: global.Track.deviceId() }, { merge: true });
      await deviceRef().update(update);
    } catch(e){
      logErr('recordCoinsEarned failed', e);
    }
  }

  // Push pending writes when the page goes away.
  global.addEventListener('pagehide', () => { flushCoins(); });
  document.addEventListener('visibilitychange', () => { if(document.hidden) flushCoins(); });

  // ── Public API ──────────────────────────────────────────────────────────
  global.CloudSync = {
    ready(){ return bootPromise; },
    isReady(){ return bootDone; },
    state(){ return cloudState; },
    recordPlay,
    recordScore,
    recordCoinsEarned,
    flush: flushCoins
  };

  boot();
})(window);
