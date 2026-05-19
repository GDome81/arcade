// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard overlay helper — drop in any game and call:
//
//   Leaderboard.show(gameId, opts?)
//
// Pulls the top N rows from Firestore (via window.Scores) and renders a
// neon overlay listing rank / name / score, with the current player's row
// highlighted. Closes on backdrop click, on the X button, or on Esc.
//
// `gameId` defaults to Track.gameId() so most games don't even need to
// pass it explicitly:
//
//   <button onclick="Leaderboard.show()">TOP 10</button>
//
// Options:
//   limit          (default 10)        how many rows to fetch
//   title          (default 'TOP 10')  heading shown above the list
//   accentColor    (default '#ffcc44') ring + heading glow
//   bgColor        (default '#0a142899')
// ─────────────────────────────────────────────────────────────────────────────
(function(global){
  if(global.Leaderboard) return;

  const STYLE_ID = '__leaderboard_style';

  function ensureStyle(accent){
    if(document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #__leaderboard{position:fixed;inset:0;z-index:99998;display:flex;
        align-items:center;justify-content:center;
        background:rgba(5,8,16,.82);backdrop-filter:blur(6px);
        font-family:'Share Tech Mono',monospace;}
      #__leaderboard .card{
        position:relative;
        max-width:min(440px,92vw);width:100%;
        background:#0a1428ee;border:2px solid ${accent}88;
        border-radius:14px;padding:22px 18px 18px;
        box-shadow:0 0 36px ${accent}66, inset 0 0 24px ${accent}11;}
      #__leaderboard h2{
        font-family:'Orbitron',sans-serif;font-weight:900;font-size:1.4rem;
        letter-spacing:.22em;color:${accent};margin:0 0 14px 0;text-align:center;
        text-shadow:0 0 18px ${accent}aa;}
      #__leaderboard .row{
        display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;
        padding:6px 10px;border-radius:6px;
        color:#cdd9ee;font-size:.95rem;letter-spacing:.04em;}
      #__leaderboard .row + .row{margin-top:2px}
      #__leaderboard .row:nth-child(odd){background:#ffffff05}
      #__leaderboard .row.me{background:${accent}22;color:#fff;
        box-shadow:0 0 18px ${accent}55;}
      #__leaderboard .rank{font-family:'Orbitron',sans-serif;font-weight:700;color:${accent};text-align:center}
      #__leaderboard .row.me .rank{color:#fff}
      #__leaderboard .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #__leaderboard .score{
        font-family:'Orbitron',sans-serif;font-weight:700;color:#fff;letter-spacing:.04em;}
      #__leaderboard .empty{color:#a0b8e0;text-align:center;padding:24px 6px;font-size:.85rem}
      #__leaderboard .loading{color:#a0b8e0;text-align:center;padding:30px 6px;font-size:.85rem;letter-spacing:.15em}
      #__leaderboard .x{
        position:absolute;top:8px;right:10px;width:30px;height:30px;border-radius:6px;
        background:transparent;border:1px solid ${accent}66;color:${accent};
        font-family:Orbitron,sans-serif;font-weight:700;font-size:14px;cursor:pointer;
        display:flex;align-items:center;justify-content:center;}
      #__leaderboard .x:hover{background:${accent}22}
    `;
    document.head.appendChild(s);
  }

  function escapeHtml(s){
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  function close(){
    const el = document.getElementById('__leaderboard');
    if(el) el.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e){ if(e.key === 'Escape') close(); }

  async function show(gameId, opts){
    opts = opts || {};
    const limit       = opts.limit       || 10;
    const title       = opts.title       || `TOP ${limit}`;
    const accent      = opts.accentColor || '#ffcc44';
    ensureStyle(accent);

    const gid = gameId
      || (global.Track && global.Track.gameId && global.Track.gameId())
      || 'unknown';
    const did = (global.Track && global.Track.deviceId && global.Track.deviceId()) || '';
    const myName = (global.Profile && global.Profile.name) || '';

    // Pre-render the shell with a loading state so the user sees instant feedback.
    close();
    const wrap = document.createElement('div');
    wrap.id = '__leaderboard';
    wrap.innerHTML = `
      <div class="card" role="dialog" aria-label="Leaderboard">
        <button class="x" aria-label="Chiudi">✕</button>
        <h2>${escapeHtml(title)}</h2>
        <div class="list"><div class="loading">caricamento…</div></div>
      </div>`;
    document.body.appendChild(wrap);
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => { if(e.target === wrap) close(); });
    wrap.querySelector('.x').addEventListener('click', close);

    // If a score was just submitted (from a game-over overlay's CLASSIFICA
    // button), wait for the write to land before fetching — otherwise the
    // player sees the leaderboard as it was BEFORE their own row landed.
    if(global.CloudSync && global.CloudSync.pendingSubmit){
      try { await global.CloudSync.pendingSubmit(); } catch(e){}
    }

    let rows = [];
    try {
      if(global.Scores && global.Scores.top){
        rows = await global.Scores.top(gid, limit);
      }
    } catch(e){ /* swallow, show empty state */ }

    // Best-known personal score for this game — from CloudSync state (which
    // is refreshed by recordScore) or the just-submitted score as a backup.
    let myBest = 0;
    const cs = global.CloudSync;
    if(cs){
      const st = cs.state && cs.state();
      const g  = st && st.games && st.games[gid];
      if(g && typeof g.bestScore === 'number') myBest = g.bestScore;
      const last = cs.lastSubmittedScore && cs.lastSubmittedScore();
      if(last && last.gid === gid && last.score > myBest) myBest = last.score;
    }

    const list = wrap.querySelector('.list');
    if(!rows.length){
      list.innerHTML = myBest > 0
        ? `<div class="empty">Nessun altro punteggio ancora.<br>Il tuo record: <b style="color:${accent}">${myBest.toLocaleString()}</b></div>`
        : `<div class="empty">Nessun punteggio ancora. Sii il primo a finire la partita!</div>`;
      return;
    }
    const inTop = rows.some(r => r.deviceId && r.deviceId === did);
    const html = rows.map((r, i) => {
      const mine = (r.deviceId && r.deviceId === did) || (r.name && r.name === myName);
      return `
        <div class="row${mine ? ' me' : ''}">
          <span class="rank">#${i + 1}</span>
          <span class="name">${escapeHtml(r.name || 'ANON')}</span>
          <span class="score">${Number(r.score || 0).toLocaleString()}</span>
        </div>`;
    }).join('');
    let extra = '';
    if(!inTop && myBest > 0){
      extra = `
        <div class="row me" style="margin-top:8px">
          <span class="rank">TU</span>
          <span class="name">${escapeHtml(myName || 'ANON')}</span>
          <span class="score">${myBest.toLocaleString()}</span>
        </div>`;
    }
    list.innerHTML = html + extra;
  }

  global.Leaderboard = { show, close };
})(window);
