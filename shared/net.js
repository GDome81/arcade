// ─────────────────────────────────────────────────────────────────────────────
// SHARED NET CLIENT — minimal WebSocket wrapper around the PartyKit "arcade"
// server. Used by every multiplayer-enabled game.
//
// Configure the server URL via `Net.config.server` BEFORE calling Net.join().
// Default points at the deployed instance; override for local `npx partykit dev`
// (which serves at ws://127.0.0.1:1999).
//
// Public API:
//   Net.join({ room, name, game })  → starts a connection; returns immediately.
//   Net.send(payload)                → broadcast to every other peer.
//   Net.sendTo(peerId, payload)      → unicast to one peer.
//   Net.onMessage(cb)                → cb(msg) for every server-relayed message.
//   Net.onRoster(cb)                 → cb(roster) when peers join/leave/rename.
//   Net.onHostChange(cb)             → cb(newHostId) after host re-election.
//   Net.leave()                      → close the socket.
//   Net.me                           → { id, name, isHost, ... }  (read-only)
//   Net.peers                        → Map<id, peerRecord>
//   Net.isHost                       → boolean
//
// Server messages this client understands:
//   { type: 'welcome',     you, roster }
//   { type: 'roster',      roster }
//   { type: 'peer-joined', peer }
//   { type: 'peer-left',   id }
//   { type: 'host-changed', newHost }
//   { type: 'broadcast',   from, payload }      // forwarded "broadcast" from peer
//   { type: 'to',          from, payload }      // forwarded "to" from peer
//   { type: 'pong',        t }
// ─────────────────────────────────────────────────────────────────────────────
(function(global){

  const Net = {
    // ── config — set Net.config.server before join() to override the default ──
    config: {
      // Set this to your deployed PartyKit URL once `npx partykit deploy` succeeds.
      // Format: 'https://arcade.<your-cloudflare-name>.partykit.dev'
      // (we'll auto-convert https → wss when opening the socket).
      server: 'https://arcade.gdome81.partykit.dev'
    },

    ws:      null,
    me:      null,        // { id, name, isHost, game, joinedAt }
    peers:   new Map(),   // id → peerRecord
    _msg:    [],
    _ros:    [],
    _host:   [],
    _open:   [],
    _close:  [],

    get isHost(){ return !!(this.me && this.me.isHost); },

    // Open a connection. `room` is a short code (4-char e.g. "XKQ7"); if not
    // provided, the URL gets a new random one. `name` is the display name.
    // `game` identifies the game (e.g. 'footgolf') so server can log/cap rooms.
    join(opts){
      this.leave();
      const room = (opts.room || randomCode()).toUpperCase();
      const name = encodeURIComponent(opts.name || 'Player');
      const game = encodeURIComponent(opts.game || 'unknown');
      const base = (this.config.server || '').replace(/^http/, 'ws');
      const url  = `${base}/parties/main/${room}?name=${name}&game=${game}`;
      this.room  = room;
      this.peers = new Map();
      this.me    = null;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen    = () => this._open.forEach(cb => { try{ cb(); }catch(e){} });
      ws.onmessage = ev => this._onServerMessage(ev.data);
      ws.onclose   = ()  => this._close.forEach(cb => { try{ cb(); }catch(e){} });
      ws.onerror   = err => console.warn('[net] socket error', err);
      return room;
    },

    leave(){
      if(this.ws){
        try { this.ws.close(); } catch(e){}
        this.ws = null;
      }
      this.me = null;
      this.peers = new Map();
    },

    send(payload){
      if(!this.ws || this.ws.readyState !== 1) return false;
      this.ws.send(JSON.stringify({ type: 'broadcast', payload }));
      return true;
    },
    sendTo(toId, payload){
      if(!this.ws || this.ws.readyState !== 1) return false;
      this.ws.send(JSON.stringify({ type: 'to', toId, payload }));
      return true;
    },
    setName(name){
      if(!this.ws || this.ws.readyState !== 1) return;
      if(this.me) this.me.name = name;
      this.ws.send(JSON.stringify({ type: 'set-name', name }));
    },

    // ── event subscriptions ────────────────────────────────────────────────
    onMessage(cb)    { this._msg.push(cb);   return () => this._msg   = this._msg.filter(f => f !== cb); },
    onRoster(cb)     { this._ros.push(cb);   return () => this._ros   = this._ros.filter(f => f !== cb); },
    onHostChange(cb) { this._host.push(cb);  return () => this._host  = this._host.filter(f => f !== cb); },
    onOpen(cb)       { this._open.push(cb);  return () => this._open  = this._open.filter(f => f !== cb); },
    onClose(cb)      { this._close.push(cb); return () => this._close = this._close.filter(f => f !== cb); },

    // ── internals ──────────────────────────────────────────────────────────
    _onServerMessage(raw){
      let msg;
      try { msg = JSON.parse(raw); } catch(e){ return; }
      switch(msg.type){
        case 'welcome':
          this.me = msg.you;
          this.peers = new Map();
          for(const p of (msg.roster || [])) this.peers.set(p.id, p);
          this._ros.forEach(cb => { try{ cb(this.peers); }catch(e){} });
          break;
        case 'roster':
          this.peers = new Map();
          for(const p of (msg.roster || [])) this.peers.set(p.id, p);
          this._ros.forEach(cb => { try{ cb(this.peers); }catch(e){} });
          break;
        case 'peer-joined':
          this.peers.set(msg.peer.id, msg.peer);
          this._ros.forEach(cb => { try{ cb(this.peers); }catch(e){} });
          break;
        case 'peer-left':
          this.peers.delete(msg.id);
          this._ros.forEach(cb => { try{ cb(this.peers); }catch(e){} });
          break;
        case 'host-changed':
          for(const p of this.peers.values()) p.isHost = (p.id === msg.newHost);
          if(this.me) this.me.isHost = (this.me.id === msg.newHost);
          this._host.forEach(cb => { try{ cb(msg.newHost); }catch(e){} });
          this._ros .forEach(cb => { try{ cb(this.peers);  }catch(e){} });
          break;
        case 'broadcast':
        case 'to':
          this._msg.forEach(cb => { try{ cb(msg); }catch(e){} });
          break;
      }
    }
  };

  function randomCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I/O/0/1 confusion
    let s = '';
    for(let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  Net.randomCode = randomCode;

  global.Net = Net;
})(window);
