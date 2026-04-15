import { createServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from './types.js';
import {
  createRoom,
  getRoom,
  setPlayerRoom,
  getPlayerRoom,
  clearPlayerRoom,
  getRoomCount,
} from './room.js';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;

// Track which player each socket belongs to
const socketPlayerMap = new WeakMap<WebSocket, string>();

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: getRoomCount() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ─── WebSocket Server ────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer });

function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

wss.on('connection', (ws: WebSocket) => {
  let lastPong = Date.now();

  // Heartbeat
  const heartbeat = setInterval(() => {
    if (Date.now() - lastPong > HEARTBEAT_TIMEOUT_MS) {
      clearInterval(heartbeat);
      ws.terminate();
      return;
    }
    ws.ping();
  }, HEARTBEAT_INTERVAL_MS);

  ws.on('pong', () => {
    lastPong = Date.now();
    const playerId = socketPlayerMap.get(ws);
    if (playerId) {
      const room = getPlayerRoom(playerId);
      room?.updatePing(playerId);
    }
  });

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendMessage(ws, { type: 'room:error', message: 'Invalid message format' });
      return;
    }

    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    clearInterval(heartbeat);
    const playerId = socketPlayerMap.get(ws);
    if (!playerId) return;

    const room = getPlayerRoom(playerId);
    if (!room) {
      clearPlayerRoom(playerId);
      return;
    }

    // Start reconnection window instead of immediately removing
    room.handleDisconnect(playerId);
    room.broadcast(playerId, {
      type: 'room:player_left',
      playerId,
      reason: 'disconnected',
    } satisfies ServerMessage);
  });

  ws.on('error', () => {
    // Error will trigger close event
  });
});

// ─── Message Handler ─────────────────────────────────────────────────────────

function handleMessage(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case 'room:create': {
      const room = createRoom();
      room.addPlayer(msg.playerId, msg.playerName, true, ws);
      socketPlayerMap.set(ws, msg.playerId);
      setPlayerRoom(msg.playerId, room.code);
      sendMessage(ws, { type: 'room:created', code: room.code });
      break;
    }

    case 'room:join': {
      const code = msg.code.toUpperCase();
      const room = getRoom(code);

      if (!room) {
        sendMessage(ws, { type: 'room:not_found' });
        return;
      }

      // Check if this is a reconnection
      if (room.hasPlayer(msg.playerId)) {
        const reconnected = room.reconnectPlayer(msg.playerId, ws);
        if (reconnected) {
          socketPlayerMap.set(ws, msg.playerId);
          setPlayerRoom(msg.playerId, room.code);
          sendMessage(ws, { type: 'room:joined', code: room.code, players: room.getPlayerInfoList() });
          room.broadcast(msg.playerId, { type: 'room:player_reconnected', playerId: msg.playerId });
          return;
        }
      }

      if (room.isFull) {
        sendMessage(ws, { type: 'room:full' });
        return;
      }

      room.addPlayer(msg.playerId, msg.playerName, false, ws);
      socketPlayerMap.set(ws, msg.playerId);
      setPlayerRoom(msg.playerId, room.code);

      // Send full player list to the joiner
      sendMessage(ws, { type: 'room:joined', code: room.code, players: room.getPlayerInfoList() });

      // Notify others
      room.broadcast(msg.playerId, {
        type: 'room:player_joined',
        playerId: msg.playerId,
        playerName: msg.playerName,
      });
      break;
    }

    case 'room:leave': {
      const playerId = socketPlayerMap.get(ws);
      if (!playerId) return;

      const room = getPlayerRoom(playerId);
      if (!room) return;

      const wasHost = room.hostId === playerId;
      room.removePlayer(playerId);
      clearPlayerRoom(playerId);
      socketPlayerMap.delete(ws);

      room.broadcast(null, {
        type: 'room:player_left',
        playerId,
        reason: 'left',
      });

      // If host left without transferring, auto-promote
      if (wasHost && room.playerCount > 0) {
        // autoPromoteHost is called internally by removePlayer -> onEmpty check
        // But if the room isn't empty, we need to promote manually
        const players = room.getPlayerInfoList();
        const currentHost = players.find(p => p.isHost);
        if (!currentHost) {
          // No host exists, promote oldest connected player
          // This is handled by the room's internal logic on next disconnect,
          // but we should also trigger it here
          const newHostId = players[0]?.id;
          if (newHostId) {
            room.transferHost(newHostId);
            room.broadcast(null, { type: 'room:host_transferred', newHostId });
          }
        }
      }
      break;
    }

    case 'room:kick': {
      const playerId = socketPlayerMap.get(ws);
      if (!playerId) return;

      const room = getPlayerRoom(playerId);
      if (!room) return;

      room.kickPlayer(msg.targetPlayerId, playerId);
      clearPlayerRoom(msg.targetPlayerId);
      break;
    }

    case 'room:transfer_host': {
      const playerId = socketPlayerMap.get(ws);
      if (!playerId) return;

      const room = getPlayerRoom(playerId);
      if (!room) return;

      if (room.hostId !== playerId) {
        sendMessage(ws, { type: 'room:error', message: 'Only the host can transfer host status' });
        return;
      }

      if (room.transferHost(msg.newHostId)) {
        room.broadcast(null, { type: 'room:host_transferred', newHostId: msg.newHostId });
      }
      break;
    }

    case 'relay': {
      const playerId = socketPlayerMap.get(ws);
      if (!playerId) return;

      const room = getPlayerRoom(playerId);
      if (!room) return;

      // Forward event to all other players in the room
      room.broadcast(playerId, { type: 'relay', event: msg.event });
      break;
    }

    case 'ping': {
      sendMessage(ws, { type: 'pong' });
      break;
    }
  }
}

// ─── Start Server ────────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`QuizBowl relay server running on 0.0.0.0:${PORT}`);
});
