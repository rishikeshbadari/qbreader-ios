import type { WebSocket } from 'ws';
import type { PlayerInfo, RoomPlayer } from './types.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_PLAYERS = 10;
const RECONNECT_WINDOW_MS = 30_000;
const LOBBY_TIMEOUT_MS = 5 * 60_000;

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  private players = new Map<string, RoomPlayer>();
  private sockets = new Map<string, WebSocket>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private lobbyTimer: NodeJS.Timeout | null = null;
  private onEmpty: () => void;

  constructor(code: string, onEmpty: () => void) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.startLobbyTimeout();
  }

  get playerCount(): number {
    return this.players.size;
  }

  get hostId(): string | null {
    for (const [id, p] of this.players) {
      if (p.isHost) return id;
    }
    return null;
  }

  get isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  getPlayerInfoList(): PlayerInfo[] {
    return Array.from(this.players.values()).map(p => ({
      id: p.playerId,
      name: p.playerName,
      isHost: p.isHost,
    }));
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  // ─── Join / Leave ──────────────────────────────────────────────────────────

  addPlayer(playerId: string, playerName: string, isHost: boolean, ws: WebSocket): void {
    const now = Date.now();
    this.players.set(playerId, {
      playerId,
      playerName,
      isHost,
      connectedAt: now,
      lastPing: now,
      connectionState: 'connected',
    });
    this.sockets.set(playerId, ws);
    this.cancelLobbyTimeout();
  }

  reconnectPlayer(playerId: string, ws: WebSocket): boolean {
    const player = this.players.get(playerId);
    if (!player || player.connectionState !== 'disconnected') return false;

    const timer = this.reconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(playerId);
    }

    player.connectionState = 'connected';
    player.disconnectedAt = undefined;
    player.lastPing = Date.now();
    this.sockets.set(playerId, ws);
    return true;
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.sockets.delete(playerId);

    const timer = this.reconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(playerId);
    }

    if (this.players.size === 0) {
      this.onEmpty();
    } else {
      this.checkLobbyTimeout();
    }
  }

  // ─── Disconnect / Reconnect Window ─────────────────────────────────────────

  handleDisconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.connectionState = 'disconnected';
    player.disconnectedAt = Date.now();
    this.sockets.delete(playerId);

    // Start reconnection window
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(playerId);
      const wasHost = player.isHost;
      this.removePlayer(playerId);

      // Broadcast that the player is gone
      this.broadcast(null, { type: 'room:player_left', playerId, reason: 'disconnected' });

      // Auto-promote new host if the host timed out
      if (wasHost) {
        this.autoPromoteHost();
      }
    }, RECONNECT_WINDOW_MS);

    this.reconnectTimers.set(playerId, timer);
  }

  // ─── Host Management ──────────────────────────────────────────────────────

  transferHost(newHostId: string): boolean {
    const newHost = this.players.get(newHostId);
    if (!newHost) return false;

    for (const p of this.players.values()) {
      p.isHost = p.playerId === newHostId;
    }
    return true;
  }

  private autoPromoteHost(): void {
    // Promote the longest-connected player
    let oldest: RoomPlayer | null = null;
    for (const p of this.players.values()) {
      if (p.connectionState === 'connected') {
        if (!oldest || p.connectedAt < oldest.connectedAt) {
          oldest = p;
        }
      }
    }

    if (oldest) {
      oldest.isHost = true;
      this.broadcast(null, { type: 'room:host_transferred', newHostId: oldest.playerId });
    }
  }

  // ─── Kick ──────────────────────────────────────────────────────────────────

  kickPlayer(targetPlayerId: string, requesterId: string): boolean {
    const requester = this.players.get(requesterId);
    if (!requester?.isHost) return false;

    const target = this.players.get(targetPlayerId);
    if (!target) return false;

    // Send kick notification to the target before removing
    const targetWs = this.sockets.get(targetPlayerId);
    if (targetWs) {
      this.sendTo(targetWs, { type: 'room:player_left', playerId: targetPlayerId, reason: 'kicked' });
      targetWs.close();
    }

    this.removePlayer(targetPlayerId);
    this.broadcast(null, { type: 'room:player_left', playerId: targetPlayerId, reason: 'kicked' });
    return true;
  }

  // ─── Messaging ─────────────────────────────────────────────────────────────

  broadcast(excludePlayerId: string | null, message: object): void {
    const data = JSON.stringify(message);
    for (const [id, ws] of this.sockets) {
      if (id === excludePlayerId) continue;
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  sendTo(ws: WebSocket, message: object): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendToPlayer(playerId: string, message: object): void {
    const ws = this.sockets.get(playerId);
    if (ws) this.sendTo(ws, message);
  }

  updatePing(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) player.lastPing = Date.now();
  }

  // ─── Lobby Timeout ─────────────────────────────────────────────────────────

  private startLobbyTimeout(): void {
    this.lobbyTimer = setTimeout(() => {
      this.broadcast(null, { type: 'room:timeout' });
      this.destroy();
    }, LOBBY_TIMEOUT_MS);
  }

  private cancelLobbyTimeout(): void {
    if (this.lobbyTimer) {
      clearTimeout(this.lobbyTimer);
      this.lobbyTimer = null;
    }
  }

  private checkLobbyTimeout(): void {
    // If only the host remains, restart lobby timeout
    const connected = Array.from(this.players.values()).filter(p => p.connectionState === 'connected');
    if (connected.length <= 1) {
      this.cancelLobbyTimeout();
      this.startLobbyTimeout();
    }
  }

  destroy(): void {
    this.cancelLobbyTimeout();
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    for (const ws of this.sockets.values()) {
      ws.close();
    }
    this.sockets.clear();
    this.players.clear();
    this.onEmpty();
  }
}

// ─── Room Manager ────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();
const playerRooms = new Map<string, string>(); // playerId -> room code

function generateCode(): string {
  let code: string;
  do {
    code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

export function createRoom(): Room {
  const code = generateCode();
  const room = new Room(code, () => {
    rooms.delete(code);
  });
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function setPlayerRoom(playerId: string, code: string): void {
  playerRooms.set(playerId, code);
}

export function getPlayerRoom(playerId: string): Room | undefined {
  const code = playerRooms.get(playerId);
  return code ? rooms.get(code) : undefined;
}

export function clearPlayerRoom(playerId: string): void {
  playerRooms.delete(playerId);
}

export function getRoomCount(): number {
  return rooms.size;
}
