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
      .catch(e => {
        console.warn('[Brutimon] registry load failed:', e);
        return { species: [] };
      });
    return registryPromise;
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

  // ── Public API ───────────────────────────────────────────────────────────
  global.Brutimon = {
    STAGES,
    BASE,
    registry,
    list,
    metaFor,
    image,
    imageReady,
    card,
    preload,
    stageName,
    stageDesc
  };
})(window);
