# Arcade Multiplayer Server

Tiny PartyKit server that powers cross-game multiplayer for the arcade.

The server is **game-agnostic**: it just maintains a room (list of peers, host election) and relays messages. Game-specific logic stays on the clients.

## Deploy

```bash
cd multiplayer
npm install
npx partykit deploy
```

The first deploy will open the browser, ask you to authenticate with your Cloudflare account, then upload the worker. The URL printed at the end looks like:

```
https://arcade.<your-cloudflare-username>.partykit.dev
```

Copy that URL and paste it into [`shared/net.js`](../shared/net.js) → `Net.config.server`.

## Local dev

```bash
npm run dev
```

Serves at `ws://127.0.0.1:1999`. To test against local, temporarily set:

```js
Net.config.server = 'http://127.0.0.1:1999';
```

in `shared/net.js`.

## Wire protocol

### Client → server

```js
{ type:'broadcast', payload }              // → forwarded to every other peer
{ type:'to', toId, payload }               // → forwarded to one peer
{ type:'set-name', name }                  // → rename in the roster
{ type:'ping', t }                         // → echoed back as pong
```

### Server → client

```js
{ type:'welcome',      you, roster }       // on connect
{ type:'roster',       roster }            // after a name change
{ type:'peer-joined',  peer }
{ type:'peer-left',    id }
{ type:'host-changed', newHost }           // on host re-election
{ type:'broadcast',    from, payload }     // mirror of a peer's broadcast
{ type:'to',           from, payload }     // mirror of a peer's `to`
{ type:'pong',         t }
```

## Adding multiplayer to a new game

1. `<script src="../shared/net.js"></script>`
2. `Net.join({ room: 'XKQ7', name: 'Mario', game: 'tanked' })`
3. `Net.send({ kind: 'whatever', ...gameSpecific })`
4. `Net.onMessage(msg => { ... })`
5. Use `Net.isHost` to decide who simulates authoritatively.
