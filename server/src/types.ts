/** Room player tracked by the server */
export type RoomPlayer = {
  playerId: string;
  playerName: string;
  isHost: boolean;
  connectedAt: number;
  lastPing: number;
  connectionState: 'connected' | 'disconnected';
  disconnectedAt?: number;
};

/** Player info sent to clients */
export type PlayerInfo = {
  id: string;
  name: string;
  isHost: boolean;
};

// ─── Client → Server Messages ────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'room:create'; playerId: string; playerName: string }
  | { type: 'room:join'; code: string; playerId: string; playerName: string }
  | { type: 'room:leave' }
  | { type: 'room:kick'; targetPlayerId: string }
  | { type: 'room:transfer_host'; newHostId: string }
  | { type: 'relay'; event: unknown }
  | { type: 'ping' };

// ─── Server → Client Messages ────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'room:created'; code: string }
  | { type: 'room:joined'; code: string; players: PlayerInfo[] }
  | { type: 'room:player_joined'; playerId: string; playerName: string }
  | { type: 'room:player_left'; playerId: string; reason: 'left' | 'kicked' | 'disconnected' }
  | { type: 'room:player_reconnected'; playerId: string }
  | { type: 'room:host_transferred'; newHostId: string }
  | { type: 'room:full' }
  | { type: 'room:not_found' }
  | { type: 'room:timeout' }
  | { type: 'room:error'; message: string }
  | { type: 'relay'; event: unknown }
  | { type: 'pong' };
