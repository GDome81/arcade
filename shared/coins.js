// ─────────────────────────────────────────────────────────────────────────────
// SHARED COIN MODULE — used by every game in the arcade.
//
// Modes (set via ?mode=… in the URL, or via the launcher):
//   paid      → normal economy: spend/earn coins; saved in localStorage. Persists
//               across sessions and games on the same origin.
//   free      → casual / demo mode: SAME earning rules as paid (each game still
//               awards coins for objectives via Coins.add), but the balance is
//               SESSION-ONLY. It starts at FREE_STARTING on page load and is
//               NEVER written to localStorage. Refreshing the page resets it.
//               Lets players try paid features (e.g. tower-defense placement
//               costs) without grinding a persistent wallet.
//   infinite  → developer/admin mode: every spend succeeds, balance never drops.
//   powerapp  → AUTO-set when embedded inside the powerapp shell. The wallet is the
//               parent's totalMoney; spend/add go through window.postMessage to keep
//               it in sync. localStorage is ignored in this mode.
//
// Wallet is shared across all games on the same origin (same localStorage) when in
// standalone paid mode. In powerapp mode the wallet is shared with the parent app
// instead. In free mode the wallet is per-tab and ephemeral.
//
// Loaded as a classic script — exposes window.Coins and window.CoinMode.
//
// ── Powerapp bridge protocol (postMessage) ─────────────────────────────────────
//   arcade → powerapp:
//     { source: 'arcade', v: 1, type: 'READY' }
//     { source: 'arcade', v: 1, type: 'COINS_SPENT',  payload: { amount, reason? } }
//     { source: 'arcade', v: 1, type: 'COINS_EARNED', payload: { amount, reason? } }
//   powerapp → arcade:
//     { source: 'powerapp', v: 1, type: 'SET_COINS', value: <number> }
// If the parent never sends SET_COINS within the handshake window, mode falls back
// to whatever URL/localStorage indicated (paid / free / infinite).
// ─────────────────────────────────────────────────────────────────────────────
(function(global){
  const URL_MODE = (new URLSearchParams(global.location.search)).get('mode');
  const STORED_MODE = global.localStorage.getItem('coinMode');
  // Default is FREE: new visitors can try every game without grinding a wallet.
  // PAID is opt-in via the settings panel for users who want persistent progress.
  let mode = URL_MODE || STORED_MODE || 'free';
  if(!['paid','free','infinite'].includes(mode)) mode = 'free';
  // Persist the chosen mode so navigation between games is sticky. powerapp mode is
  // never persisted — it's negotiated at runtime from the parent handshake.
  global.localStorage.setItem('coinMode', mode);

  const KEY = 'coins';
  const FREE_STARTING = 0;        // starting wallet in free mode (per-session) — earn via objectives like paid
  let balance = parseInt(global.localStorage.getItem(KEY) || '0', 10);
  if(!Number.isFinite(balance) || balance < 0) balance = 0;

  // Free mode keeps its OWN session balance, separate from the persisted paid
  // balance so switching modes doesn't clobber paid progress.
  let sessionBalance = FREE_STARTING;

  function activeBalance(){
    if(mode === 'infinite') return Infinity;
    if(mode === 'free')     return sessionBalance;
    return balance;
  }
  function adjustBalance(delta){
    if(mode === 'infinite') return;
    if(mode === 'free'){ sessionBalance = Math.max(0, sessionBalance + delta); return; }
    balance = Math.max(0, balance + delta);
  }

  // ── Powerapp bridge state ───────────────────────────────────────────────────
  // Bridge becomes "active" after the parent answers READY with a SET_COINS message.
  // While active, balance is mirrored from the parent and never written to localStorage.
  let bridgeActive = false;
  function sendToParent(type, payload){
    if(!global.parent || global.parent === global) return;
    const msg = { source: 'arcade', v: 1, type };
    if(payload != null) msg.payload = payload;
    try { global.parent.postMessage(msg, '*'); } catch(e) {}
  }

  function save(){
    if(bridgeActive) return;       // parent is the source of truth
    if(mode === 'free') return;    // session-only, never persisted
    global.localStorage.setItem(KEY, String(balance));
  }
  function notify(){
    global.dispatchEvent(new CustomEvent('coins:change', {
      detail: { balance: get(), mode }
    }));
  }
  function get(){ return activeBalance(); }

  const Coins = {
    get mode(){ return mode; },
    get balance(){ return get(); },
    /** True when embedded inside the powerapp shell. */
    get bridgeActive(){ return bridgeActive; },
    setMode(m){
      if(!['paid','free','infinite'].includes(m)) return;
      if(bridgeActive) return; // powerapp mode overrides — ignore manual changes
      // Entering free mode resets the per-session wallet so each "free play"
      // starts from the same baseline. The persisted paid balance is left
      // untouched in localStorage and reappears when switching back to paid.
      if(m === 'free') sessionBalance = FREE_STARTING;
      mode = m;
      global.localStorage.setItem('coinMode', m);
      notify();
    },
    canSpend(n){
      if(mode === 'infinite') return true;
      return activeBalance() >= n;
    },
    spend(n, reason){
      if(!Number.isFinite(n) || n <= 0) return false;
      if(mode === 'infinite') return true;
      if(activeBalance() < n) return false;
      // Optimistic local update. In powerapp mode the parent will confirm with a
      // fresh SET_COINS that re-syncs us; in standalone modes we persist directly.
      adjustBalance(-n);
      if(bridgeActive){
        sendToParent('COINS_SPENT', { amount: n, reason: reason || null });
      } else {
        save();   // no-op in free / powerapp
      }
      if(global.Track) global.Track.event('coin_spent', { amount: n, reason: reason || null });
      notify();
      return true;
    },
    add(n, reason){
      if(!Number.isFinite(n) || n <= 0) return;
      if(mode === 'infinite') return;      // infinite balance, no need to track
      adjustBalance(n);
      if(bridgeActive){
        sendToParent('COINS_EARNED', { amount: n, reason: reason || null });
      } else {
        save();   // no-op in free
      }
      if(global.Track) global.Track.event('coin_earned', { amount: n, reason: reason || null });
      notify();
    },
    reset(){
      if(bridgeActive) return; // can't reset the parent's wallet from here
      if(mode === 'free'){ sessionBalance = FREE_STARTING; notify(); return; }
      balance = 0; save(); notify();
    },
    // Convenience for HUD/launcher displays
    formatted(){
      if(mode === 'infinite') return '∞';
      return String(activeBalance());
    }
  };

  // ── Powerapp handshake ──────────────────────────────────────────────────────
  global.addEventListener('message', (event) => {
    const msg = event.data;
    if(!msg || msg.source !== 'powerapp' || msg.v !== 1) return;
    if(msg.type !== 'SET_COINS') return;
    bridgeActive = true;
    const incoming = Number(msg.value);
    balance = Number.isFinite(incoming) && incoming >= 0 ? incoming : 0;
    if(mode !== 'powerapp'){
      mode = 'powerapp';
      // Note: we do NOT persist powerapp into localStorage's coinMode — it's a
      // runtime mode that only applies while embedded.
    }
    notify();
  });
  // Announce readiness to the parent. If nobody answers, mode/balance stay whatever
  // they were from URL / localStorage — i.e. the games still work standalone.
  setTimeout(() => sendToParent('READY'), 0);

  global.Coins = Coins;
  global.CoinMode = mode;
})(window);
