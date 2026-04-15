import Constants from 'expo-constants';

import type { GameEvent } from '@/types/multiplayer';
import { WebSocketTransport } from './ws-transport';

/**
 * Callbacks for transport events
 */
export type TransportCallbacks = {
  onEvent: (event: GameEvent) => void;
  onError?: (error: Error) => void;
};

/**
 * A discovered nearby game session (legacy — kept for interface compatibility)
 */
export type DiscoveredSession = {
  sessionId: string;
  players: string[];
};

/**
 * Callbacks for peer discovery events (legacy — no-op for WebSocket transport)
 */
export type DiscoveryCallbacks = {
  onSessionFound: (session: DiscoveredSession) => void;
  onSessionLost: (sessionId: string) => void;
};

/**
 * Transport interface for multiplayer communication
 */
export interface MultiplayerTransport {
  readonly isHost: boolean;
  readonly sessionId: string | null;
  startHosting(sessionId: string, playerNames: string, callbacks: TransportCallbacks): Promise<void>;
  joinSession(sessionId: string, callbacks: TransportCallbacks): Promise<void>;
  send(event: GameEvent): Promise<void>;
  disconnect(): Promise<void>;
  updateAdvertising(playerNames: string): Promise<void>;
  startBrowsing(callbacks: DiscoveryCallbacks): Promise<void>;
  stopBrowsing(): Promise<void>;
}

/**
 * Loopback transport for local development/testing
 */
class LoopbackTransport implements MultiplayerTransport {
  isHost = false;
  sessionId: string | null = null;
  private callbacks?: TransportCallbacks;

  async startHosting(sessionId: string, _playerNames: string, callbacks: TransportCallbacks) {
    this.isHost = true;
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  async joinSession(sessionId: string, callbacks: TransportCallbacks) {
    this.isHost = false;
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  async send(event: GameEvent) {
    // Loopback: immediately deliver to self
    queueMicrotask(() => this.callbacks?.onEvent(event));
  }

  async disconnect() {
    this.isHost = false;
    this.sessionId = null;
    this.callbacks = undefined;
  }

  async updateAdvertising(_playerNames: string) {
    // No-op in loopback mode
  }

  async startBrowsing(_callbacks: DiscoveryCallbacks) {
    // No-op: discovery not available in loopback mode
  }

  async stopBrowsing() {
    // No-op
  }
}

const RELAY_SERVER_URL =
  Constants.expoConfig?.extra?.relayServerUrl ?? 'ws://localhost:8080';

/**
 * Create the appropriate transport for the current platform
 */
export function createTransport(): MultiplayerTransport {
  if (RELAY_SERVER_URL && RELAY_SERVER_URL !== 'loopback') {
    return new WebSocketTransport(RELAY_SERVER_URL);
  }
  return new LoopbackTransport();
}
