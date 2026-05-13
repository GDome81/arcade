// ─────────────────────────────────────────────────────────────────────────────
// ARCADE MULTIPLAYER SERVER (PartyKit / Cloudflare Workers Durable Object).
//
// One server, many rooms. A "room" is identified by its 4-char code in the URL
// (e.g. wss://arcade.<user>.partykit.dev/parties/main/XKQ7). The server is
// GAME-AGNOSTIC: it doesn't know what footgolf or tanked actually do — it
// only:
//   1. Tracks who's in the room and a small "presence" record per peer.
//   2. Designates the first connection as HOST (others = guests).
//   3. Relays every message of type "broadcast" to every other peer.
//   4. Relays "to" messages to a single named peer.
//   5. Re-elects a host on disconnect if needed.
//
// All game-specific state (ball position, turn order, scores) lives ON the
// CLIENTS. The host is the authoritative simulator; other clients send their
// input to the host and render whatever state the host broadcasts back. This
// keeps the server stateless-ish and trivially scalable.
// ─────────────────────────────────────────────────────────────────────────────

export default class ArcadeRoom {
  constructor(party){
    this.party = party;
    // Map<connectionId, { id, name, isHost, gameType, joinedAt }>
    this.peers = new Map();
  }

  onConnect(conn, ctx){
    // Query string carries the player's chosen display name and the game type.
    //   ?name=Mario&game=footgolf
    const url   = new URL(ctx.request.url);
    const name  = (url.searchParams.get('name') || 'Player').slice(0, 16);
    const game  = (url.searchParams.get('game') || 'unknown').slice(0, 24);
    const isHost = this.peers.size === 0;
    const rec = {
      id: conn.id,
      name,
      game,
      isHost,
      joinedAt: Date.now()
    };
    this.peers.set(conn.id, rec);

    // Tell the new connection who it is and the current roster.
    conn.send(JSON.stringify({
      type: 'welcome',
      you: rec,
      roster: this.roster()
    }));
    // Tell everyone else that someone joined.
    this.broadcast({ type: 'peer-joined', peer: rec }, conn.id);
  }

  onClose(conn){
    const rec = this.peers.get(conn.id);
    if(!rec) return;
    this.peers.delete(conn.id);
    // If the host left, promote the next earliest joiner.
    if(rec.isHost){
      const next = [...this.peers.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if(next){
        next.isHost = true;
        this.party.broadcast(JSON.stringify({ type: 'host-changed', newHost: next.id }));
      }
    }
    this.broadcast({ type: 'peer-left', id: conn.id });
  }

  onMessage(raw, conn){
    let msg;
    try { msg = JSON.parse(raw); } catch(e){ return; }
    if(!msg || typeof msg !== 'object') return;

    switch(msg.type){
      case 'broadcast':
        // Forward `msg.payload` to everyone except the sender.
        this.broadcast({ type: 'broadcast', from: conn.id, payload: msg.payload }, conn.id);
        break;
      case 'to':
        // Forward to a single peer (host or arbitrary).
        if(typeof msg.toId === 'string'){
          const target = [...this.party.getConnections()].find(c => c.id === msg.toId);
          if(target) target.send(JSON.stringify({ type: 'to', from: conn.id, payload: msg.payload }));
        }
        break;
      case 'set-name':
        // Allow renaming after connect.
        const rec = this.peers.get(conn.id);
        if(rec && typeof msg.name === 'string'){
          rec.name = msg.name.slice(0, 16);
          this.party.broadcast(JSON.stringify({ type: 'roster', roster: this.roster() }));
        }
        break;
      case 'ping':
        // Latency probe — server echoes back the client timestamp.
        conn.send(JSON.stringify({ type: 'pong', t: msg.t }));
        break;
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  roster(){
    return [...this.peers.values()];
  }
  broadcast(obj, exceptId){
    const payload = JSON.stringify(obj);
    for(const c of this.party.getConnections()){
      if(c.id === exceptId) continue;
      c.send(payload);
    }
  }
}
