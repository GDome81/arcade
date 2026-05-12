// ─────────────────────────────────────────────────────────────────────────────
// SHARED COIN MODULE — used by every game in the arcade.
//
// Modes (set via ?mode=… in the URL, or via the launcher):
//   paid      → normal economy: spend/earn coins; saved in localStorage
//   free      → demo/kiosk mode: no spending, no earning, all paid features locked
//   infinite  → developer/admin mode: every spend succeeds, balance never drops
//
// Wallet is shared across all games on the same origin (same localStorage).
// Loaded as a classic script — exposes window.Coins and window.CoinMode.
// ─────────────────────────────────────────────────────────────────────────────
(function(global){
  const URL_MODE = (new URLSearchParams(global.location.search)).get('mode');
  const STORED_MODE = global.localStorage.getItem('coinMode');
  let mode = URL_MODE || STORED_MODE || 'paid';
  if(!['paid','free','infinite'].includes(mode)) mode = 'paid';
  // Persist the chosen mode so navigation between games is sticky.
  global.localStorage.setItem('coinMode', mode);

  const KEY = 'coins';
  let balance = parseInt(global.localStorage.getItem(KEY) || '0', 10);
  if(!Number.isFinite(balance) || balance < 0) balance = 0;

  function save(){ global.localStorage.setItem(KEY, String(balance)); }
  function notify(){
    global.dispatchEvent(new CustomEvent('coins:change', {
      detail: { balance: get(), mode }
    }));
  }
  function get(){ return mode === 'infinite' ? Infinity : balance; }

  const Coins = {
    get mode(){ return mode; },
    get balance(){ return get(); },
    setMode(m){
      if(!['paid','free','infinite'].includes(m)) return;
      mode = m;
      global.localStorage.setItem('coinMode', m);
      notify();
    },
    canSpend(n){
      if(mode === 'free') return false;
      if(mode === 'infinite') return true;
      return balance >= n;
    },
    spend(n){
      if(!Number.isFinite(n) || n <= 0) return false;
      if(mode === 'free') return false;
      if(mode === 'infinite') return true;
      if(balance < n) return false;
      balance -= n; save(); notify();
      return true;
    },
    add(n){
      if(!Number.isFinite(n) || n <= 0) return;
      if(mode === 'free') return;          // demo mode never earns
      if(mode === 'infinite') return;      // infinite balance, no need to track
      balance += n; save(); notify();
    },
    reset(){
      balance = 0; save(); notify();
    },
    // Convenience for HUD/launcher displays
    formatted(){
      return mode === 'infinite' ? '∞'
           : mode === 'free'     ? '—'
           : String(balance);
    }
  };

  global.Coins = Coins;
  global.CoinMode = mode;
})(window);
