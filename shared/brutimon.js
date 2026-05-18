// ─────────────────────────────────────────────────────────────────────────────
// shared/brutimon.js
//
// Loader + helpers for the BRUTIMON roster.
// Each species lives under shared/brutimon/<id>/ with:
//   • <id>_1.png .. <id>_5.png    — five evolution stages, 128×128, transparent
//   • card.md                      — YAML-style metadata (name, type, rarity,
//                                    personality, stage_N_name, stage_N_desc)
// The list of available species is at shared/brutimon/index.json.
//
// Usage from any game (after <script src="../shared/brutimon.js"></script>):
//
//   await Brutimon.registry();                  // → { species: [...] }
//   const list = await Brutimon.list();         // → ['glitchino', 'lumibloom']
//   const card = await Brutimon.card('glitchino');
//   card.name           // 'Glitchino'
//   card.stage_3_name   // 'Glitchor'
//   card.stage_3_desc   // ...
//
//   const im = Brutimon.image('glitchino', 3);  // HTMLImageElement (stage 3)
//   await Brutimon.preload(['glitchino', 'lumibloom']);
//
// Stage index is 1..5. Internally the asset URL is resolved against the
// directory where this script lives, so the same path works for the launcher
// (root) and for each game folder (a sibling of /shared).
// ─────────────────────────────────────────────────────────────────────────────
(function(global){
  if(global.Brutimon) return;

  // Resolve the absolute folder of this script so URLs work from any page.
  const SCRIPT_URL = (document.currentScript && document.currentScript.src)
    || (function(){
        const ss = document.getElementsByTagName('script');
        for(const s of ss){ if(s.src && /brutimon\.js(?:\?|$)/.test(s.src)) return s.src; }
        return '';
      })();
  const SHARED_DIR = SCRIPT_URL.replace(/\/[^/]+$/, '');   // .../shared
  const BASE       = SHARED_DIR + '/brutimon';

  const STAGES = 5;

  // ── Caches ───────────────────────────────────────────────────────────────
  let registryPromise = null;
  let cachedRegistry = { species: [] };   // synchronous fallback for randomEnemy() callers
  const imgCache  = new Map();   // 'id|stage' → HTMLImageElement
  const cardCache = new Map();   // 'id' → parsed card object (or Promise)

  // ── Registry ─────────────────────────────────────────────────────────────
  function registry(){
    if(registryPromise) return registryPromise;
    registryPromise = fetch(`${BASE}/index.json`)
      .then(r => {
        if(!r.ok) throw new Error('brutimon index.json HTTP ' + r.status);
        return r.json();
      })
      .then(j => { cachedRegistry = j || { species: [] }; return cachedRegistry; })
      .catch(e => {
        console.warn('[Brutimon] registry load failed:', e);
        return { species: [] };
      });
    return registryPromise;
  }
  // Synchronous accessor — returns whatever was last cached. Useful for
  // callers (game loops) that can't await but need a roster *right now*.
  function speciesListSync(){
    return (cachedRegistry.species || []).slice();
  }
  function list(){ return registry().then(r => (r.species || []).map(s => s.id)); }

  function metaFor(id){
    return registry().then(r => (r.species || []).find(s => s.id === id) || null);
  }

  // ── Sprite ───────────────────────────────────────────────────────────────
  // Returns an HTMLImageElement (may not be fully loaded yet — caller can
  // wait on .complete or set onload, or use preload()).
  function image(speciesId, stage){
    const s = Math.max(1, Math.min(STAGES, stage | 0));
    const key = `${speciesId}|${s}`;
    if(imgCache.has(key)) return imgCache.get(key);
    const im = new Image();
    im.src = `${BASE}/${speciesId}/${speciesId}_${s}.png`;
    imgCache.set(key, im);
    return im;
  }
  function imageReady(im){ return im && im.complete && im.naturalWidth > 0; }

  // ── Card (YAML-style key:value) ──────────────────────────────────────────
  function parseCard(text){
    const obj = {};
    text.split(/\r?\n/).forEach(line => {
      // Skip blank lines and comments
      if(!line.trim() || line.trim().startsWith('#')) return;
      const idx = line.indexOf(':');
      if(idx < 0) return;
      const key = line.slice(0, idx).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const val = line.slice(idx + 1).trim();
      if(key) obj[key] = val;
    });
    return obj;
  }
  function card(speciesId){
    if(cardCache.has(speciesId)) return Promise.resolve(cardCache.get(speciesId));
    const p = fetch(`${BASE}/${speciesId}/card.md`)
      .then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(parseCard)
      .catch(e => {
        console.warn(`[Brutimon] card.md load failed for ${speciesId}:`, e);
        return { name: speciesId, error: true };
      })
      .then(parsed => { cardCache.set(speciesId, parsed); return parsed; });
    cardCache.set(speciesId, p);   // store the in-flight promise so callers don't race
    return p;
  }

  // Convenience: stage label / description out of a card.
  function stageName(card, stage){
    return (card && card['stage_' + stage + '_name']) || `Stage ${stage}`;
  }
  function stageDesc(card, stage){
    return (card && card['stage_' + stage + '_desc']) || '';
  }

  // ── Preload (fires off image+card fetches in parallel) ───────────────────
  function preload(ids){
    const list = Array.isArray(ids) ? ids : [ids];
    return Promise.all(list.map(id => {
      // Trigger image downloads (they're cached in imgCache)
      for(let s = 1; s <= STAGES; s++) image(id, s);
      return card(id);
    }));
  }
  // Preload every species in the registry. Resolves once the registry has
  // loaded and all image fetches have been kicked off (the images themselves
  // download lazily — caller can check Brutimon.imageReady before drawing).
  function preloadAll(){
    return registry().then(reg => preload((reg.species || []).map(s => s.id)));
  }

  // ── Tier specs (shared across games) ─────────────────────────────────────
  // Each stage maps to a "tier" used as the unit role in action games:
  //   1 chibi cucciolo → swarm fodder, fast and weak
  //   2 giovane        → standard chaser, balanced
  //   3 adolescente    → shooter that keeps its distance
  //   4 adulto         → charger / mini-boss with bursts
  //   5 leggendario    → BOSS (radial fire), reserved for boss waves
  //
  // hpMult / spdMult / radiusMult are relative multipliers — each game then
  // applies its own base values on top. Color is a "neon" tint each game
  // can use for halos or HP bars to convey rarity at a glance.
  const TIER_SPECS = [
    null,
    { stage:1, rarity:'comune',      hpMult:1.0,  spdMult:1.15, radiusMult:0.85, behavior:'chase',  color:'#ff4488' },
    { stage:2, rarity:'non-comune',  hpMult:1.6,  spdMult:1.00, radiusMult:1.00, behavior:'chase',  color:'#ffdd44' },
    { stage:3, rarity:'raro',        hpMult:2.6,  spdMult:0.90, radiusMult:1.15, behavior:'shoot',
      fireRateMs:1500, projSpd:280, range:230,                            color:'#cc66ff' },
    { stage:4, rarity:'epico',       hpMult:4.0,  spdMult:0.80, radiusMult:1.35, behavior:'charge',
      chargeCdMs:1500, chargeDurMs:550, chargeMult:3.4,                  color:'#ff66cc' },
    { stage:5, rarity:'leggendario', hpMult:10.0, spdMult:0.70, radiusMult:1.80, behavior:'boss',
      fireRateMs:1700, projSpd:240,                                       color:'#ffcc44' },
  ];
  function tierSpec(stage){ return TIER_SPECS[Math.max(1, Math.min(STAGES, stage | 0))]; }

  // Weighted random stage based on a run-level. Low levels are almost all
  // stage 1; later levels gradually introduce stages 2-4. Stage 5 is NEVER
  // returned by this function — bosses get it via bossEnemy().
  function pickStage(level){
    const L = Math.max(1, level | 0);
    const w = [
      0,
      Math.max(8,  72 - L * 4),                       // stage 1
      L >= 2 ?  Math.min(40,  8 + L * 3) : 6,         // stage 2
      L >= 4 ?  Math.min(28,  (L - 3) * 4) : 0,       // stage 3
      L >= 6 ?  Math.min(18,  (L - 5) * 2) : 0,       // stage 4
      0,                                              // stage 5 (boss-only)
    ];
    let total = 0;
    for(let i = 1; i <= 5; i++) total += w[i];
    let r = Math.random() * total;
    for(let i = 1; i <= 5; i++){ r -= w[i]; if(r <= 0) return i; }
    return 1;
  }

  function pickSpecies(){
    const list = speciesListSync();
    if(!list.length) return 'glitchino';   // first-frame fallback before registry loads
    return list[Math.floor(Math.random() * list.length)].id;
  }

  // Build a fully-resolved enemy spec the game can instantiate immediately:
  // copies the tier spec, fills in species + a (possibly still-loading)
  // HTMLImageElement, includes a hint label. Caller adds positions/HP.
  function randomEnemy(level){
    const stage = pickStage(level);
    const speciesId = pickSpecies();
    const spec = tierSpec(stage);
    return Object.assign({}, spec, {
      species: speciesId,
      stage,
      sprite: image(speciesId, stage),
      isBoss: false,
    });
  }
  function bossEnemy(level){
    const speciesId = pickSpecies();
    const spec = tierSpec(5);
    return Object.assign({}, spec, {
      species: speciesId,
      stage: 5,
      sprite: image(speciesId, 5),
      isBoss: true,
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────
  global.Brutimon = {
    STAGES,
    BASE,
    registry,
    speciesListSync,
    list,
    metaFor,
    image,
    imageReady,
    card,
    preload,
    preloadAll,
    stageName,
    stageDesc,
    // Roster helpers shared across action games (rush / dodge / defender / ...)
    TIER_SPECS,
    tierSpec,
    pickStage,
    pickSpecies,
    randomEnemy,
    bossEnemy
  };
})(window);
