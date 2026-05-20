// ─────────────────────────────────────────────────────────────────────────────
// THEME — multi-skin support for the arcade. Three skins:
//
//   pokemon  (default) → BRUTIMON theme, kids/cyberpunk neon
//   classic            → BRUTIMON sprites + neon palette, no extra branding
//   fitness            → Original fitness theme: 5 athlete SVGs as mascots,
//                        warm/sport palette, renamed games, hidden pet sims
//
// Activates the right `skin-*` class on <html> as soon as this script loads
// so CSS variables defined in theme.css resolve before paint.
//
// Monkey-patches Brutimon.image so existing games that draw the brutimon
// sprites get fitness mascots automatically when skin === 'fitness'. The
// patch runs after this module loads, which is why theme.js MUST be
// included AFTER shared/brutimon.js in every game's <script> chain.
// ─────────────────────────────────────────────────────────────────────────────
(function(global){
  if(global.Theme) return;

  // 1) Apply the skin class to <html> ASAP — runs at script parse time so
  //    every CSS rule under `html.skin-fitness` settles before first paint.
  const SKINS = ['pokemon', 'classic', 'fitness'];
  function readSkin(){
    const s = (function(){ try { return localStorage.getItem('skin'); } catch(e){ return null; } })();
    return SKINS.includes(s) ? s : 'pokemon';
  }
  const initialSkin = readSkin();
  document.documentElement.classList.add('skin-' + initialSkin);

  // 2) Fitness roster: 5 mascots, no evolution stages. Each maps to one
  //    SVG file under shared/fitness/. Order is the canonical lookup order
  //    for "the Nth brutimon-equivalent".
  const FITNESS_ROLES = ['runner', 'lifter', 'yogi', 'cyclist', 'jumper'];

  // 3) Per-folder game rename + hide map for fitness skin. Setting a
  //    folder to `null` means the tile is hidden from the launcher AND
  //    the game itself is considered unavailable in this skin.
  const FITNESS_NAMES = {
    'pokemon-rush':       'GYM RUSH',
    'pokemon-dodge':      'DODGE JUNK FOOD',
    'pokemon-whack':      'SCHIACCIA PIGRIZIA',
    'pokemon-fall':       'CATTURA SUPERFOOD',
    'pokemon-stack':      'STACK & REP',
    'pokemon-memory':     'WORKOUT MEMORY',
    'pokemon-breaker':    'POWER BREAKER',
    'pokemon-soccer':     'FIT BALL',
    'pokemon-soccer-tap': 'FIT BALL TAP',
    'pokemon-volley':     'BEACH FIT',
    'pokemon-rhythm':     'CARDIO BEAT',
    'brutimon-panic':     'REVEAL WORKOUT',
    'brutimon-splash':    'PAINT THE GYM',
    'brutimon-pong':      'PADDLE FIT',
    'apex-racer':         'APEX RACER',
    'flipper':            'POWER PINBALL',
    'neon-breaker':       'NEON BREAKER',
    'snake-cosmos':       'PROTEIN SNAKE',
    'pixel-platformer':   'FIT PLATFORMER',
    'footgolf-kick':      'FITNESS GOLF',
    'tanked':             'TANKED!',
    'neon-defender':      'STAMINA DEFENDER',
    'night-streets':      'CITY RUN',
    'galactic-trader':    'COSMIC TRADER',
    'match-estate':       'SUPERFOOD MATCH',
    'pokemon-care':       null,   // pet sim → hidden in fitness
    'sprite-editor':      null    // mascot editor → hidden in fitness
  };

  // 4) Per-folder short description override (used by the launcher tiles).
  //    Falls back to the HTML default if no entry here.
  const FITNESS_DESCS = {
    'pokemon-rush':       "Roguelite a stanze: il tuo atleta si allena automaticamente, tu lo muovi col joystick e schivi gli avversari. Tra una stanza e l'altra scegli una carta-potenziamento.",
    'pokemon-dodge':      "Sopravvivi alle ondate di tentazioni alimentari che ti rincorrono. Power-up SCATTO / SCUDO / BOMBA. Quanto a lungo resisti?",
    'pokemon-whack':      "Schiaccia gli omini pigri che escono dalle buche. Evita i finti malati: tapparli toglie punti. Più punti in 45 secondi.",
    'pokemon-fall':       "Snack salutari cadono dall'alto, sposti il cestino col dito per catturarli. Schiva il junk food. 60 secondi, 3 vite.",
    'pokemon-stack':      "Tap per impilare un blocco-allenamento. Più centri il timing, meno la torre si restringe. Quante reps riesci a fare?",
    'pokemon-memory':     "Memory a coppie: gira due carte e accoppia gli esercizi uguali. Trova tutte le coppie nel minor numero di mosse.",
    'pokemon-breaker':    "Breakout per famiglia: muovi un grosso pugno e la pallina rompe i blocchi-pigrizia. Distruggi tutto per il livello successivo.",
    'pokemon-soccer':     "Calcio 3v3 di squadre fitness. Tap-to-aim, hold-to-power, power-up DASH/POWER/FREEZE. Primo a 3 gol.",
    'pokemon-soccer-tap': "Calcetto 3v3 dove controlli un solo atleta. Tap per correre verso la palla — l'impatto la lancia. Primo a 3 gol vince.",
    'pokemon-volley':     "Beach-volley 1v1 sulla sabbia. Tap per correre, tap in alto per saltare e schiacciare. Primo a 5 punti.",
    'pokemon-rhythm':     "Rhythm-game a 4 corsie con musica cardio. Premi a tempo (DFJK o tap mobile) per il voto massimo (S / A / B / C / D).",
    'brutimon-panic':     "Cammini sul bordo e tracci linee per ritagliare territorio. Le aree senza nemici si rivelano: 75% del workout = livello vinto.",
    'brutimon-splash':    "Cammina sulla griglia per dipingerla con la pennellata e rivelare il poster del workout sotto. Schiva avversari e spara, raccogli i power-up.",
    'brutimon-pong':      "Pallina rimbalza fra due racchette. Schiacciala oltre l'avversario per il punto. Modalità VS AI o 2 giocatori in landscape.",
    'apex-racer':         "Corsa arcade dall'alto su 15 piste. Sterza con frecce/tap, evita gli avversari e arriva primo. Modalità endless con strada infinita.",
    'flipper':            "Tavolo flipper con bumper, ramp loop e 4 alette (Z/M o tap mobile; SPAZIO o angolo per lanciare). 3 missioni → multiball.",
    'neon-breaker':       "Rompi-mattoncini: muovi la racchetta col dito, tap per lanciare la pallina. Power-up multi-ball e cannone, livelli random.",
    'snake-cosmos':       "Serpente spaziale infinito: mangia proteine per crescere, evita la coda e i predatori. Quanto puoi diventare lungo?",
    'pixel-platformer':   "Platform 2D: salti, monete, ostacoli da schiacciare dall'alto. Frecce per muoverti, SPAZIO per saltare. 3 livelli.",
    'footgolf-kick':      "Golf col pallone da calcio. Trascina indietro per puntare, rilascia per tirare. 9 buche del campaign + buche procedurali.",
    'tanked':             "Arena di 4 carri armati: tu contro 3 AI. Joystick per muoverti, tap per sparare. Power-up + upgrade permanenti tra una run e l'altra.",
    'neon-defender':      "Tower-defense a 10 ondate: 4 tipi di torre lungo il percorso degli avversari. Coin per sblocchi permanenti.",
    'night-streets':      "Stealth dall'alto: muoviti tra i palazzi evitando i coni di vista delle guardie. Heat al 100% = catturato.",
    'galactic-trader':    "Shoot-em-up con economia: mina asteroidi, vendi alle stazioni, potenzia nave e armi. Sopravvivi ai pirati.",
    'match-estate':       "Allinea 3+ superfood uguali per fare punti su 30 livelli in 5 capitoli. Combo laser/bomba/rainbow; ricostruisci stanza per stanza."
  };

  // 5) Compute base URL for fitness assets. brutimon.js sets BASE to
  //    './shared/brutimon' on the launcher and '../shared/brutimon'
  //    inside games — same relative path works for fitness/.
  function fitnessBase(){
    if(global.Brutimon && global.Brutimon.BASE){
      return global.Brutimon.BASE.replace(/\/brutimon\b/, '/fitness');
    }
    return './shared/fitness';
  }

  // 6) Cache for fitness <Image>s so repeated lookups don't re-fetch.
  const fitnessImgCache = Object.create(null);
  function fitnessImage(role){
    if(fitnessImgCache[role]) return fitnessImgCache[role];
    const im = new Image();
    im.src = fitnessBase() + '/' + role + '.svg';
    fitnessImgCache[role] = im;
    return im;
  }

  // Tiny string hash so the same brutimon species always resolves to the
  // same fitness role across calls (deterministic mapping).
  function _hash(s){
    let h = 2166136261;
    for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }

  // 7) Monkey-patch Brutimon.image so every game that draws brutimon
  //    sprites gets a fitness mascot in fitness skin without per-game
  //    code changes. Stage is intentionally ignored — we have a single
  //    sprite per persona.
  function patchBrutimon(){
    if(!global.Brutimon || !global.Brutimon.image) return;
    if(global.Brutimon._themePatched) return;
    const orig = global.Brutimon.image.bind(global.Brutimon);
    global.Brutimon.image = function(speciesId, stage){
      if(Theme.skin === 'fitness'){
        const idx = _hash(speciesId) % FITNESS_ROLES.length;
        return fitnessImage(FITNESS_ROLES[idx]);
      }
      return orig(speciesId, stage);
    };
    global.Brutimon._themePatched = true;
  }
  patchBrutimon();

  // 8) Public API.
  const Theme = {
    SKINS,
    get skin(){ return readSkin(); },
    isFitness(){ return this.skin === 'fitness'; },
    isBrutimon(){ return this.skin === 'pokemon'; },
    setSkin(s){
      if(!SKINS.includes(s)) return;
      try { localStorage.setItem('skin', s); } catch(e){}
      document.documentElement.classList.remove('skin-pokemon', 'skin-classic', 'skin-fitness');
      document.documentElement.classList.add('skin-' + s);
      global.dispatchEvent(new CustomEvent('theme:change', { detail: { skin: s } }));
    },
    fitnessRoles(){ return FITNESS_ROLES.slice(); },
    fitnessImage,
    gameName(folder, fallback){
      if(this.skin === 'fitness'){
        const n = FITNESS_NAMES[folder];
        if(n !== undefined && n !== null) return n;
      }
      return fallback;
    },
    gameDesc(folder, fallback){
      if(this.skin === 'fitness'){
        const d = FITNESS_DESCS[folder];
        if(d) return d;
      }
      return fallback;
    },
    isGameHidden(folder){
      if(this.skin === 'fitness') return FITNESS_NAMES[folder] === null;
      return false;
    },
    arcadeTitle(){
      if(this.skin === 'fitness') return 'FIT ARENA';
      return 'ARCADE';
    },
    // Helper used by per-game boot scripts: rebrand <title> + the menu
    // header if a known selector matches. Folder must be the game's
    // directory name (matches the keys in FITNESS_NAMES).
    applyGameBranding(folder){
      const newName = this.gameName(folder, null);
      if(!newName || this.skin !== 'fitness') return;
      // Update <title>
      try { document.title = newName; } catch(e){}
      // Update the first big heading (h1 / h2) — every game's main menu
      // displays the game's name there. Skip elements that are clearly
      // game-state messages (GAME OVER, VITTORIA, etc.) by matching
      // length + uppercase ratio.
      const heads = document.querySelectorAll('h1, h2');
      const ORIG_NAMES = {
        'pokemon-rush':       'BRUTIMON RUSH',
        'pokemon-dodge':      'BRUTIMON DODGE',
        'pokemon-whack':      'BRUTIMON WHACK',
        'pokemon-fall':       'BRUTIMON FALL',
        'pokemon-stack':      'BRUTIMON STACK',
        'pokemon-memory':     'BRUTIMON MEMORY',
        'pokemon-breaker':    'BRUTIMON BREAKER',
        'pokemon-soccer':     'BRUTIMON SOCCER',
        'pokemon-soccer-tap': 'BRUTIMON SOCCER TAP',
        'pokemon-volley':     'BRUTIMON VOLLEY',
        'pokemon-rhythm':     'BRUTIMON RHYTHM',
        'brutimon-panic':     'BRUTIMON PANIC',
        'brutimon-splash':    'BRUTIMON SPLASH',
        'brutimon-pong':      'BRUTIMON PONG',
        'apex-racer':         'APEX RACER',
        'flipper':            'NEON PINBALL',
        'neon-breaker':       'NEON BREAKER',
        'snake-cosmos':       'SNAKE COSMOS',
        'pixel-platformer':   'PIXEL PLATFORMER',
        'footgolf-kick':      'FOOTGOLF KICK',
        'tanked':             'TANKED!',
        'neon-defender':      'NEON DEFENDER+',
        'night-streets':      'NIGHT STREETS',
        'galactic-trader':    'GALACTIC TRADER',
        'match-estate':       'MATCH ESTATE'
      };
      const orig = ORIG_NAMES[folder];
      for(const h of heads){
        const t = (h.textContent || '').trim();
        if(orig && t === orig){ h.textContent = newName; }
        else if(t === 'BRUTIMON ' + folder.toUpperCase()){ h.textContent = newName; }
      }
    }
  };
  global.Theme = Theme;

  // Re-apply patch if Brutimon was loaded after theme.js (defensive — most
  // games include brutimon first but the launcher loads them in parallel
  // sometimes).
  if(!global.Brutimon || !global.Brutimon.image){
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      if(global.Brutimon && global.Brutimon.image){
        patchBrutimon();
        clearInterval(id);
      } else if(tries > 50){ clearInterval(id); }
    }, 100);
  }

  // 9b) MutationObserver: some games (brutimon-pong / splash / panic /
  //     pokemon-rush / pokemon-care) populate their species pickers via
  //     `<img src="${Brutimon.BASE}/...">` rather than Brutimon.image(),
  //     so the monkey-patch above never sees them. We catch those `<img>`
  //     elements as they're added / their src changes and rewrite them
  //     to the matching fitness SVG.
  function rewriteImageSrc(img){
    if(Theme.skin !== 'fitness' || !img || img.tagName !== 'IMG') return;
    const src = img.getAttribute('src') || '';
    const m = src.match(/(.*)\/brutimon\/([^/]+)\/[^/]+\.png$/);
    if(!m) return;
    const base    = m[1];
    const species = m[2];
    const idx     = _hash(species) % FITNESS_ROLES.length;
    img.setAttribute('src', base + '/fitness/' + FITNESS_ROLES[idx] + '.svg');
  }
  function startImgObserver(){
    if(!document.body) {
      document.addEventListener('DOMContentLoaded', startImgObserver, { once: true });
      return;
    }
    // First pass: any <img> already in the DOM.
    document.querySelectorAll('img').forEach(rewriteImageSrc);
    const obs = new MutationObserver(muts => {
      if(Theme.skin !== 'fitness') return;
      for(const m of muts){
        if(m.type === 'attributes' && m.attributeName === 'src' && m.target.tagName === 'IMG'){
          rewriteImageSrc(m.target);
        }
        if(m.type === 'childList'){
          m.addedNodes.forEach(node => {
            if(!node) return;
            if(node.tagName === 'IMG') rewriteImageSrc(node);
            else if(node.querySelectorAll){
              node.querySelectorAll('img').forEach(rewriteImageSrc);
            }
          });
        }
      }
    });
    obs.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['src']
    });
  }
  if(initialSkin === 'fitness') startImgObserver();

  // 9) Auto-boot: figure out which game we're in from the URL path and
  //    rebrand its <title> + main heading on DOMContentLoaded. Skips the
  //    root launcher (which handles its own renaming inline). Re-runs
  //    after a short delay because some games build the menu via inline
  //    scripts that run AFTER DOMContentLoaded.
  function detectFolder(){
    const p = location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
    const seg = p.split('/').filter(Boolean).pop();
    if(!seg) return null;
    // Whitelist of game folders — anything else (the repo root) should
    // return null and skip the auto-rebrand.
    const known = new Set([
      'pokemon-rush','pokemon-dodge','pokemon-whack','pokemon-fall',
      'pokemon-stack','pokemon-memory','pokemon-breaker','pokemon-soccer',
      'pokemon-soccer-tap','pokemon-volley','pokemon-rhythm','pokemon-care',
      'brutimon-panic','brutimon-splash','brutimon-pong',
      'apex-racer','flipper','neon-breaker','snake-cosmos','pixel-platformer',
      'footgolf-kick','tanked','neon-defender','night-streets',
      'galactic-trader','match-estate','sprite-editor','sokomoji','dungeon-runner'
    ]);
    return known.has(seg) ? seg : null;
  }
  function autoBoot(){
    const folder = detectFolder();
    if(!folder) return;
    if(Theme.skin !== 'fitness') return;
    Theme.applyGameBranding(folder);
    // Second pass after a tick — handles menu DOM that's built inside
    // game scripts firing slightly later than DOMContentLoaded.
    setTimeout(() => Theme.applyGameBranding(folder), 250);
    setTimeout(() => Theme.applyGameBranding(folder), 1500);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', autoBoot);
  } else {
    autoBoot();
  }
})(window);
