// ─────────────────────────────────────────────────────────────────────────────
// Firebase + Firestore + Analytics for the arcade.
//
// Drop-in: each game just includes <script src="../shared/firebase.js"></script>
// (or shared/firebase.js for the launcher) and gets:
//
//   • A global `Track` object with .event(name, params) for fire-and-forget
//     event logging to Firestore (collection `events`) and Google Analytics 4
//     (when consent is given).
//   • A global `Scores` object with .submit(game, score, name) and
//     .top(game, limit) for the public leaderboard collection.
//   • Automatic `session_start` on load and `session_end` on pagehide /
//     visibility change, with duration in ms.
//   • Anonymous deviceId (UUID v4 in localStorage). No accounts, no PII.
//
// Privacy / EU cookie consent:
//   • Firestore writes don't set any cookies → always allowed.
//   • Google Analytics SDK *does* set cookies → only loaded after the user
//     clicks "OK" on the consent banner. Until they decide, no analytics.
//   • The choice is stored once in localStorage and respected on all pages.
// ─────────────────────────────────────────────────────────────────────────────
(function(){
  if(window.__arcadeFirebaseInstalled) return;
  window.__arcadeFirebaseInstalled = true;

  const CONFIG = {
    apiKey: "AIzaSyATbZkwGq5XmrbMm2sdMMQNVXt88cCm9Tw",
    authDomain: "giochi-brutti.firebaseapp.com",
    projectId: "giochi-brutti",
    storageBucket: "giochi-brutti.firebasestorage.app",
    messagingSenderId: "415108773450",
    appId: "1:415108773450:web:a9033ad4bbcf86ccbe58b3",
    measurementId: "G-WXX4SZ7YNV"
  };
  const SDK_VERSION = '10.13.2';
  const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

  // ── Anonymous IDs ────────────────────────────────────────────────────────
  function uuid(){
    if(crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  function deviceId(){
    let id;
    try { id = localStorage.getItem('arcade-device-id'); } catch(e){}
    if(!id){
      id = uuid();
      try { localStorage.setItem('arcade-device-id', id); } catch(e){}
    }
    return id;
  }
  // New session every full page load.
  const SESSION_ID = uuid();
  function sessionId(){ return SESSION_ID; }

  // ── Game id from URL ─────────────────────────────────────────────────────
  // /pokemon-rush/         → 'pokemon-rush'
  // /pokemon-rush/index.html → 'pokemon-rush'
  // /                       → 'launcher'
  // /index.html             → 'launcher'
  function detectGameId(){
    const parts = location.pathname.split('/').filter(Boolean);
    if(parts.length === 0) return 'launcher';
    const last = parts[parts.length - 1];
    if(last.toLowerCase().endsWith('.html')){
      return parts.length >= 2 ? parts[parts.length - 2] : 'launcher';
    }
    return last || 'launcher';
  }
  const GAME_ID = detectGameId();

  // ── Async SDK loader ─────────────────────────────────────────────────────
  function loadScript(src){
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if(existing){ resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve; s.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  // ── State ────────────────────────────────────────────────────────────────
  let fs = null;                   // Firestore handle
  let analyticsActive = false;     // Analytics SDK loaded + initialised
  let ready = false;               // Firestore ready, can flush queue
  const pending = [];              // events queued until Firestore ready
  const sessionStartedAt = Date.now();

  function consent(){
    try { return localStorage.getItem('arcade-analytics-consent'); } catch(e){ return null; }
  }
  function setConsent(value){
    try { localStorage.setItem('arcade-analytics-consent', value); } catch(e){}
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  async function init(){
    try {
      await loadScript(`${SDK_BASE}/firebase-app-compat.js`);
      await loadScript(`${SDK_BASE}/firebase-firestore-compat.js`);
      if(!firebase.apps || !firebase.apps.length) firebase.initializeApp(CONFIG);
      fs = firebase.firestore();
      ready = true;
      // Flush queued events
      while(pending.length){ const e = pending.shift(); doSend(e.name, e.params); }
      // Automatic session_start
      send('session_start', { gameId: GAME_ID });
      hookLifecycle();
      // If consent was already given previously, load Analytics now.
      if(consent() === 'true') ensureAnalytics();
      maybeShowBanner();
    } catch(e){
      // Never let firebase failures break games — silent fallback.
      console.warn('[Track] init failed:', e);
    }
  }

  async function ensureAnalytics(){
    if(analyticsActive) return;
    if(consent() !== 'true') return;
    try {
      await loadScript(`${SDK_BASE}/firebase-analytics-compat.js`);
      const a = firebase.analytics();
      a.setUserId(deviceId());
      a.setUserProperties({ first_game: GAME_ID });
      analyticsActive = true;
    } catch(e){
      console.warn('[Track] analytics load failed:', e);
    }
  }

  // ── Send events (Firestore + GA4) ────────────────────────────────────────
  function send(name, params){
    if(!ready){ pending.push({ name, params }); return; }
    doSend(name, params);
  }

  function clean(obj){
    const out = {};
    for(const k of Object.keys(obj || {})){
      const v = obj[k];
      if(v === undefined || v === null) continue;
      if(typeof v === 'object' && !Array.isArray(v)){
        // GA4 doesn't like nested objects; flatten into JSON string under a 'data' field
        out[k] = JSON.stringify(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function currentPlayerName(){
    try { return (window.Profile && window.Profile.name) || ''; } catch(e){ return ''; }
  }

  function doSend(name, params){
    const safeParams = clean(params);
    const playerName = currentPlayerName();
    // Firestore document
    const doc = {
      gameId: safeParams.gameId || GAME_ID,
      event: name,
      sessionId: sessionId(),
      deviceId: deviceId(),
      playerName,                 // '' if user hasn't set one
      payload: safeParams,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    fs.collection('events').add(doc).catch(err => {
      console.warn('[Track] events.add failed', err);
    });
    // Analytics (best effort; GA4 caps event-name length at 40 + param key 40)
    if(analyticsActive){
      try {
        firebase.analytics().logEvent(name.slice(0, 40), Object.assign(
          { game_id: doc.gameId, session_id: doc.sessionId, player_name: playerName || undefined },
          safeParams
        ));
      } catch(e){}
    }
  }

  // ── Lifecycle: session_end on hide ──────────────────────────────────────
  let sessionClosed = false;
  function endSession(reason){
    if(sessionClosed) return;
    sessionClosed = true;
    send('session_end', {
      gameId: GAME_ID,
      durationMs: Date.now() - sessionStartedAt,
      reason: reason || 'hide'
    });
  }
  function hookLifecycle(){
    document.addEventListener('visibilitychange', () => {
      if(document.hidden) endSession('visibility');
    });
    window.addEventListener('pagehide', () => endSession('pagehide'));
  }

  // ── Scores API (public leaderboard) ──────────────────────────────────────
  async function whenReady(){
    if(ready) return;
    return new Promise(resolve => {
      const t = setInterval(() => { if(ready){ clearInterval(t); resolve(); } }, 80);
    });
  }
  async function submitScore(game, score, name){
    await whenReady();
    const gid = String(game || GAME_ID);
    const did = deviceId();
    // Default to the player's set nickname, then 'ANON'. Validate via Profile
    // module if available so leaderboard names go through the profanity filter.
    let resolved = name || currentPlayerName() || 'ANON';
    if(window.Profile){
      const v = window.Profile.validate(resolved);
      if(!v.ok){
        resolved = currentPlayerName() || 'ANON';
      } else {
        resolved = v.name;
      }
    }
    const newScore = Number(score) || 0;
    // Deterministic doc id = "<gameId>__<deviceId>": one row per player per
    // game, so a fresh run that beats the previous best OVERWRITES it
    // instead of stacking another entry next to it. Old runs (when this
    // change is deployed) keep using auto-IDs and are merged client-side
    // in topScores() below.
    const docId = (gid + '__' + did).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    try {
      const ref = fs.collection('scores').doc(docId);
      const prev = await ref.get();
      if(prev.exists){
        const oldScore = Number((prev.data() || {}).score) || 0;
        if(newScore <= oldScore){
          // Not a new personal best — touch lastSeen but don't bump the row.
          return true;
        }
      }
      await ref.set({
        gameId: gid,
        deviceId: did,
        name: String(resolved).slice(0, 24),
        score: newScore,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return true;
    } catch(e){
      console.warn('[Scores] submit failed', e);
      return false;
    }
  }
  async function topScores(game, limit){
    await whenReady();
    const want = limit || 20;
    try {
      // Pull MORE than asked so the post-query dedupe (by deviceId, then
      // by name) still leaves us with enough rows even if the same player
      // is recorded multiple times — e.g. legacy auto-ID entries from
      // before the deterministic-doc-id rollout.
      const snap = await fs.collection('scores')
        .where('gameId', '==', String(game || GAME_ID))
        .orderBy('score', 'desc')
        .limit(Math.max(want * 4, 40))
        .get();
      const seen = new Set();
      const out  = [];
      for(const d of snap.docs){
        const data = d.data() || {};
        const key  = data.deviceId || ('name:' + (data.name || ''));
        if(seen.has(key)) continue;
        seen.add(key);
        out.push(Object.assign({ id: d.id }, data));
        if(out.length >= want) break;
      }
      return out;
    } catch(e){
      console.warn('[Scores] top failed', e);
      return [];
    }
  }

  // ── Consent banner (shown once until decided) ───────────────────────────
  function maybeShowBanner(){
    if(consent() != null) return;       // already decided
    // Don't blow up if body isn't ready yet
    if(!document.body){
      document.addEventListener('DOMContentLoaded', maybeShowBanner);
      return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'arcade-consent';
    Object.assign(wrap.style, {
      position: 'fixed',
      left: '0', right: '0', bottom: '0',
      zIndex: '99999',
      background: 'rgba(10,4,24,.92)',
      borderTop: '1px solid #ff44aa66',
      color: '#dfb8ef',
      padding: '12px 14px',
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '13px',
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      textAlign: 'center',
      backdropFilter: 'blur(6px)'
    });
    wrap.innerHTML = `
      <span style="max-width:560px;line-height:1.4">
        Usiamo cookie di analytics anonimi solo per capire quali giochi vi piacciono. Niente pubblicità, niente vendita dati.
      </span>
      <button id="ac-yes" style="background:transparent;border:1px solid #44ffcc;color:#44ffcc;
        font-family:Orbitron,sans-serif;font-weight:700;padding:8px 16px;border-radius:6px;
        letter-spacing:.18em;cursor:pointer;font-size:11px">OK</button>
      <button id="ac-no" style="background:transparent;border:1px solid #ff44aa66;color:#a888bb;
        font-family:Orbitron,sans-serif;font-weight:700;padding:8px 14px;border-radius:6px;
        letter-spacing:.18em;cursor:pointer;font-size:11px">SOLO ESSENZIALI</button>
    `;
    document.body.appendChild(wrap);
    document.getElementById('ac-yes').addEventListener('click', () => {
      setConsent('true'); wrap.remove(); ensureAnalytics();
      send('consent_given', { value: 'all' });
    });
    document.getElementById('ac-no').addEventListener('click', () => {
      setConsent('false'); wrap.remove();
      send('consent_given', { value: 'essential' });
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────
  window.Track = {
    event: send,
    deviceId,
    sessionId,
    gameId: () => GAME_ID,
    isReady: () => ready,
    setAnalyticsConsent(yes){
      setConsent(yes ? 'true' : 'false');
      if(yes) ensureAnalytics();
    },
    analyticsConsent: () => consent()
  };
  window.Scores = {
    submit: submitScore,
    top: topScores
  };

  init();
})();
