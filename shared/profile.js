// ─────────────────────────────────────────────────────────────────────────────
// Shared player profile.
//
// The arcade has no accounts — just an anonymous device id from firebase.js
// plus an OPTIONAL human-readable nickname stored in localStorage. The
// nickname is what we attach to leaderboard entries and (when set) to every
// Track event so the stats dashboard can group activity by player.
//
//   Profile.name             // current nickname or ''
//   Profile.setName(name)    // validates + saves; returns { ok, reason?, name? }
//   Profile.validate(name)   // dry-run validation (returns same shape)
//
// Validation rules:
//   • 2–16 characters
//   • Letters (Unicode), digits, space, underscore, hyphen, apostrophe
//   • No leading / trailing whitespace, no double spaces
//   • Not on the multilingual profanity blocklist (with l33t normalization)
//
// The blocklist below covers the most common slurs and swears in Italian,
// English, Spanish, French and German. It is intentionally a starting set —
// no automatic filter is exhaustive, but it stops the obvious "DICKHEAD"
// /  "CAZZONE" submissions on the global leaderboard. Add to BAD_WORDS as
// needed.
// ─────────────────────────────────────────────────────────────────────────────
(function(global){
  if(global.Profile) return;

  const STORAGE_KEY = 'arcade-player-name';

  // Lowercase substrings to reject. We match on the *normalized* nickname
  // (l33t-folded, separators stripped, lower-cased) so "f.u.c.k" and "fvck"
  // get caught alongside "fuck".
  const BAD_WORDS = [
    // English
    'fuck','fucker','fucking','shit','bullshit','bitch','asshole','dick',
    'pussy','cunt','cock','slut','whore','bastard','nigger','nigga','faggot',
    'retard','wanker','twat','motherfuck',
    // Italian
    'cazzo','cazzone','minchia','merda','stronzo','stronza','troia','puttana',
    'puttan','vaffanculo','fanculo','coglione','coglion','frocio','negro',
    'zoccola','bastardo','figadi','figo','sega','pompino','culo','culone',
    // Spanish
    'mierda','joder','cabron','cabrón','puta','pendejo','gilipollas','coño',
    'cono','polla','chinga','chingar','marica','maricon','maricón',
    // French
    'merde','putain','connard','connasse','enculé','encule','salope','bite',
    'pute','niquer','nique','foutre','con',
    // German
    'scheisse','scheiße','scheis','arsch','arschloch','fotze','wichser',
    'hurensohn','schwanz','schlampe','nutte','muschi',
    // Generic slurs / hate
    'porn','nazi','hitler','isis','hentai','rape','rapist'
  ];

  // Characters often substituted in l33t / disguised swears.
  const L33T = {
    '0':'o', '1':'i', '3':'e', '4':'a', '5':'s', '7':'t', '8':'b',
    '@':'a', '$':'s', '!':'i', '+':'t', '|':'i', '*':'',
    'ı':'i', 'ø':'o', 'œ':'oe', 'ð':'d', 'þ':'th',
    'ñ':'n', 'ç':'c', 'ß':'ss',
    'à':'a', 'á':'a', 'â':'a', 'ä':'a', 'ã':'a',
    'è':'e', 'é':'e', 'ê':'e', 'ë':'e',
    'ì':'i', 'í':'i', 'î':'i', 'ï':'i',
    'ò':'o', 'ó':'o', 'ô':'o', 'ö':'o', 'õ':'o',
    'ù':'u', 'ú':'u', 'û':'u', 'ü':'u',
    'ý':'y', 'ÿ':'y'
  };

  function normalizeForCheck(s){
    if(!s) return '';
    s = String(s).toLowerCase();
    // Substitute confusables / l33t
    let out = '';
    for(const ch of s){
      out += (L33T[ch] != null) ? L33T[ch] : ch;
    }
    // Strip everything except letters (so separators like ".", "-" don't hide
    // a swear like f.u.c.k → fuck)
    return out.replace(/[^a-z]/g, '');
  }

  function containsProfanity(name){
    const folded = normalizeForCheck(name);
    if(!folded) return false;
    for(const w of BAD_WORDS){
      if(folded.includes(w)) return true;
    }
    return false;
  }

  // Allow letters in any script (Unicode \p{L}), digits, plus a few safe
  // separators. Block emojis, punctuation, weird control chars.
  // Note: \p{L} requires the Unicode flag on the regex.
  const ALLOWED_CHARS = /^[\p{L}\p{N} _'\-]+$/u;

  function validate(raw){
    const name = String(raw || '').trim().replace(/\s+/g, ' ');
    if(name.length < 2)  return { ok: false, reason: 'minimo 2 caratteri' };
    if(name.length > 16) return { ok: false, reason: 'massimo 16 caratteri' };
    if(!ALLOWED_CHARS.test(name)){
      return { ok: false, reason: 'solo lettere, numeri e spazi' };
    }
    if(containsProfanity(name)){
      return { ok: false, reason: 'nome non consentito' };
    }
    return { ok: true, name };
  }

  function getName(){
    try { return localStorage.getItem(STORAGE_KEY) || ''; }
    catch(e){ return ''; }
  }
  function writeName(name){
    try { localStorage.setItem(STORAGE_KEY, name); } catch(e){}
    try {
      if(global.firebase && global.firebase.analytics){
        global.firebase.analytics().setUserProperties({ player_name: name });
      }
    } catch(e){}
    global.dispatchEvent(new CustomEvent('profile:change', { detail: { name } }));
  }
  function setName(raw){
    const v = validate(raw);
    if(!v.ok) return v;
    writeName(v.name);
    return { ok: true, name: v.name };
  }

  // ── Default name generator ──────────────────────────────────────────────
  const ADJECTIVES = [
    'Neon','Cyber','Mystic','Stellar','Lunar','Solar','Cosmic','Bold','Brave',
    'Fierce','Mighty','Swift','Wild','Wise','Tiny','Mega','Hyper','Ultra',
    'Vivace','Forte','Saggio','Bravo','Allegro','Veloce','Calmo','Folle'
  ];
  const NOUNS = [
    'Swift','Mini','Boss','Tank','Runner','Champ','Hero','Ranger','Star',
    'Bolt','Wave','Knight','Sparkle','Trainer','Pilot','Ace','Spark','Flame',
    'Storm','Shadow','Comet','Falcon','Tiger','Wolf','Phoenix'
  ];
  function generateDefaultName(){
    const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 900 + 100); // 100–999
    return `${a}${n}${num}`;
  }

  // ── Unique-name reservation (Firestore) ─────────────────────────────────
  // Tries to claim `desired` in the global `players` collection. If the
  // doc id already exists owned by someone else, auto-increments a suffix
  // until a free name is found. Returns the resolved unique name.
  //
  // Falls back to `desired` on any Firestore error so games still work
  // offline / without analytics consent.
  async function reserveUniqueName(desired){
    if(!global.firebase || !global.firebase.firestore){
      return { ok: true, name: desired, reserved: false };
    }
    const fs = global.firebase.firestore();
    const did = (global.Track && global.Track.deviceId && global.Track.deviceId()) || 'unknown';
    const base = String(desired || '').trim();
    if(!base) return { ok: false, reason: 'nome vuoto' };

    for(let suffix = 0; suffix < 100; suffix++){
      const candidate = suffix === 0 ? base : `${base}${suffix + 1}`;
      if(candidate.length > 20) break;
      const docId = candidate.toLowerCase();
      try {
        const ref  = fs.collection('players').doc(docId);
        const snap = await ref.get();
        if(snap.exists){
          const data = snap.data() || {};
          if(data.deviceId === did){
            // Already ours — just refresh lastSeen.
            try {
              await ref.set({ lastSeen: global.firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            } catch(e){}
            return { ok: true, name: candidate, reserved: true, mine: true };
          }
          // Taken by another device — try the next suffix.
          continue;
        }
        // Free — reserve it.
        await ref.set({
          name: candidate,
          deviceId: did,
          createdAt: global.firebase.firestore.FieldValue.serverTimestamp(),
          lastSeen:  global.firebase.firestore.FieldValue.serverTimestamp()
        });
        return { ok: true, name: candidate, reserved: true };
      } catch(e){
        // Network / permission failure: stop trying, return desired as-is.
        console.warn('[Profile] reserveUniqueName failed:', e);
        return { ok: true, name: desired, reserved: false, error: e.message || 'firestore' };
      }
    }
    return { ok: false, reason: 'troppe collisioni' };
  }

  // Wait briefly for Firebase SDK to finish loading before reserving.
  function whenFirebaseReady(timeoutMs){
    return new Promise(resolve => {
      const t0 = Date.now();
      const i = setInterval(() => {
        if(global.firebase && global.firebase.firestore){ clearInterval(i); resolve(true); }
        else if(Date.now() - t0 > (timeoutMs || 5000)){ clearInterval(i); resolve(false); }
      }, 60);
    });
  }

  // Full setName + reserve. Returns { ok, name, reserved, reason? }.
  async function setNameAsync(raw){
    const v = validate(raw);
    if(!v.ok) return v;
    await whenFirebaseReady(5000);
    const r = await reserveUniqueName(v.name);
    if(!r.ok) return r;
    writeName(r.name);
    return r;
  }

  // Boot: if no name yet, generate a default and reserve it (best-effort).
  // The launcher input prefills with this so the user sees a real
  // name in leaderboards/events from session 1.
  async function ensureDefaultName(){
    if(getName()) return;
    // Persist a default locally immediately so events have a name to attach
    // (Firestore reservation may take a second or two to complete).
    const desired = generateDefaultName();
    writeName(desired);
    await whenFirebaseReady(5000);
    const r = await reserveUniqueName(desired);
    if(r && r.ok && r.name && r.name !== desired){
      writeName(r.name);
    }
  }

  function displayName(){
    const n = getName();
    return n || 'ANONIMO';
  }

  global.Profile = {
    get name(){ return getName(); },
    setName,                      // sync, local-only
    setNameAsync,                 // async, with Firestore uniqueness
    reserveUniqueName,            // raw reservation helper
    validate,
    displayName,
    isProfanity: containsProfanity,
    generateDefaultName,
    ensureDefaultName,
    STORAGE_KEY
  };

  // Kick off default-name assignment in the background.
  // (Returns a promise but we don't await it; nothing blocks on it.)
  ensureDefaultName();
})(window);
