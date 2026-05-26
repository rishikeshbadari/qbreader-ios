import type { GameEvent } from '@/types/multiplayer';
import type { MultiplayerTransport, TransportCallbacks, DiscoveryCallbacks } from './transport';

/**
 * Callbacks for server-level room events (separate from game events).
 */
export type ServerEventCallbacks = {
  onRoomCreated?: (code: string) => void;
  onRoomJoined?: (code: string, players: { id: string; name: string; isHost: boolean }[]) => void;
  onPlayerJoined?: (playerId: string, playerName: string) => void;
  onPlayerLeft?: (playerId: string, reason: 'left' | 'kicked' | 'disconnected') => void;
  onPresenceSync?: (players: { id: string; name: string }[]) => void;
  onPlayerReconnected?: (playerId: string) => void;
  onHostTransferred?: (newHostId: string) => void;
  onConnectionStatusChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
  onRoomTimeout?: () => void;
  onRoomError?: (message: string) => void;
  onRoomFull?: () => void;
  onRoomNotFound?: () => void;
};

const RECONNECT_INTERVAL_MS = 2_000;
const MAX_RECONNECT_ATTEMPTS = 15; // 30 seconds
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * WebSocket relay transport for multiplayer communication.
 *
 * Connects to a lightweight relay server that manages rooms by game code.
 * All game events are forwarded opaquely — the server never parses game logic.
 */
export class WebSocketTransport implements MultiplayerTransport {
  isHost = false;
  sessionId: string | null = null;

  private ws: WebSocket | null = null;
  private callbacks?: TransportCallbacks;
  private serverCallbacks?: ServerEventCallbacks;
  private playerId: string | null = null;
  private playerName: string | null = null;
  private reconnectTimer?: ReturnType<typeof setInterval>;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private connected = false;
  private pingInterval?: ReturnType<typeof setInterval>;

  constructor(private serverUrl: string) {}

  /**
   * Set server-level event callbacks. Must be called before startHosting/joinSession.
   */
  setServerCallbacks(callbacks: ServerEventCallbacks): void {
    this.serverCallbacks = callbacks;
  }

  async startHosting(
    _sessionId: string,
    playerNames: string,
    callbacks: TransportCallbacks,
  ): Promise<void> {
    this.isHost = true;
    this.callbacks = callbacks;
    this.playerName = playerNames;

    await this.openConnection();

    // Request room creation
    this.sendRaw({
      type: 'room:create',
      playerId: this.playerId ?? _sessionId,
      playerName: this.playerName ?? 'Host',
    });
  }

  async joinSession(
    sessionId: string,
    callbacks: TransportCallbacks,
  ): Promise<void> {
    this.isHost = false;
    this.sessionId = sessionId.toUpperCase();
    this.callbacks = callbacks;

    await this.openConnection();

    // Join room by code
    this.sendRaw({
      type: 'room:join',
      code: this.sessionId!,
      playerId: this.playerId ?? '',
      playerName: this.playerName ?? 'Player',
    });
  }

  /**
   * Set player identity before joining. Called by MultiplayerContext.
   */
  setPlayerInfo(playerId: string, playerName: string): void {
    this.playerId = playerId;
    this.playerName = playerName;
  }

  async send(event: GameEvent): Promise<void> {
    this.sendRaw({ type: 'relay', event });
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.connected = false;
    this.stopReconnecting();
    this.stopPing();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendRaw({ type: 'room:leave' });
      }
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }

    this.ws = null;
    this.isHost = false;
    this.sessionId = null;
    this.callbacks = undefined;
    this.serverCallbacks = undefined;
    this.playerId = null;
    this.playerName = null;
  }

  async updateAdvertising(_playerNames: string): Promise<void> {
    // No-op: server manages room state
  }

  async startBrowsing(_callbacks: DiscoveryCallbacks): Promise<void> {
    // No-op: discovery is by game code, not browsing
  }

  async stopBrowsing(): Promise<void> {
    // No-op
  }

  // ─── Kick & Host Transfer (server-level commands) ────────────────────────

  kickPlayer(targetPlayerId: string): void {
    this.sendRaw({ type: 'room:kick', targetPlayerId });
  }

  transferHost(newHostId: string): void {
    this.sendRaw({ type: 'room:transfer_host', newHostId });
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /**
   * Open a WebSocket connection and wait for it to be ready.
   * Rejects if connection fails or times out.
   */
  private openConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.intentionalClose = false;
      this.connected = false;

      const timeout = setTimeout(() => {
        reject(new Error('Connection timed out'));
        this.ws?.close();
      }, CONNECT_TIMEOUT_MS);

      try {
        this.ws = new WebSocket(this.serverUrl);
      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`Failed to create WebSocket: ${err}`));
        return;
      }

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.stopReconnecting();
        this.startPing();
        this.serverCallbacks?.onConnectionStatusChange?.('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
          this.handleServerMessage(msg);
        } catch (err) {
          this.callbacks?.onError?.(err as Error);
        }
      };

      this.ws.onclose = () => {
        this.stopPing();
        if (!this.connected) {
          // Connection never succeeded — reject the initial promise
          clearTimeout(timeout);
          reject(new Error('WebSocket connection closed before opening'));
          return;
        }
        if (!this.intentionalClose) {
          this.connected = false;
          this.serverCallbacks?.onConnectionStatusChange?.('reconnecting');
          this.startReconnecting();
        }
      };

      this.ws.onerror = () => {
        // onerror is always followed by onclose, which handles rejection
      };
    });
  }

  private handleServerMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'room:created':
        this.sessionId = msg.code as string;
        this.serverCallbacks?.onRoomCreated?.(msg.code as string);
        break;

      case 'room:joined':
        this.sessionId = msg.code as string;
        this.serverCallbacks?.onRoomJoined?.(
          msg.code as string,
          msg.players as { id: string; name: string; isHost: boolean }[],
        );
        break;

      case 'room:player_joined':
        this.serverCallbacks?.onPlayerJoined?.(
          msg.playerId as string,
          msg.playerName as string,
        );
        break;

      case 'room:player_left':
        this.serverCallbacks?.onPlayerLeft?.(
          msg.playerId as string,
          msg.reason as 'left' | 'kicked' | 'disconnected',
        );
        break;

      case 'room:player_reconnected':
        this.serverCallbacks?.onPlayerReconnected?.(msg.playerId as string);
        break;

      case 'room:host_transferred':
        this.serverCallbacks?.onHostTransferred?.(msg.newHostId as string);
        break;

      case 'room:full':
        this.serverCallbacks?.onRoomFull?.();
        break;

      case 'room:not_found':
        this.serverCallbacks?.onRoomNotFound?.();
        break;

      case 'room:timeout':
        this.serverCallbacks?.onRoomTimeout?.();
        break;

      case 'room:error':
        this.serverCallbacks?.onRoomError?.(msg.message as string);
        break;

      case 'relay':
        // Unwrap and deliver to game event callback
        this.callbacks?.onEvent(msg.event as GameEvent);
        break;

      case 'pong':
        // Heartbeat response — no action needed
        break;
    }
  }

  private sendRaw(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ─── Reconnection ───────────────────────────────────────────────────────

  private startReconnecting(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setInterval(() => {
      this.reconnectAttempts++;

      if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        this.stopReconnecting();
        this.serverCallbacks?.onConnectionStatusChange?.('disconnected');
        return;
      }

      // Attempt reconnection
      this.openConnection().then(() => {
        // Re-join the room with existing identity
        if (this.sessionId && this.playerId) {
          this.sendRaw({
            type: 'room:join',
            code: this.sessionId,
            playerId: this.playerId,
            playerName: this.playerName ?? 'Player',
          });
        }
      }).catch(() => {
        // Will retry on next interval tick
      });
    }, RECONNECT_INTERVAL_MS);
  }

  private stopReconnecting(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.reconnectAttempts = 0;
  }

  // ─── Heartbeat ──────────────────────────────────────────────────────────

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.sendRaw({ type: 'ping' });
    }, 15_000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }
}
