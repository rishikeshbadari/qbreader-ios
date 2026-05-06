import Constants from 'expo-constants';

import type { GameEvent } from '@/types/multiplayer';
import { SupabaseTransport } from './supabase-transport';

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
 * Callbacks for peer discovery events (no-op for current transports)
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
 * Loopback transport for local development/testing.
 * Echoes events back to the sender — useful when there is no remote peer.
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
    queueMicrotask(() => this.callbacks?.onEvent(event));
  }

  async disconnect() {
    this.isHost = false;
    this.sessionId = null;
    this.callbacks = undefined;
  }

  async updateAdvertising(_playerNames: string) {}
  async startBrowsing(_callbacks: DiscoveryCallbacks) {}
  async stopBrowsing() {}
}

/**
 * In-process paired transport for autonomous playtest of multiplayer.
 *
 * Multiple instances sharing the same sessionId form a peer group through a
 * module-level bus. Sends are delivered to every OTHER endpoint on the bus
 * (matching Supabase Broadcast `self: false` semantics), so a single device
 * can host one MultiplayerContext while a bot peer joins the same session
 * and exercises the host-vs-peer divergence paths.
 *
 * Not used in production — opt in with EXPO_PUBLIC_USE_PAIRED_LOOPBACK=1.
 */
type Endpoint = { transport: PairedLoopbackTransport; callbacks: TransportCallbacks };
const pairedBus = new Map<string, Set<Endpoint>>();

export class PairedLoopbackTransport implements MultiplayerTransport {
  isHost = false;
  sessionId: string | null = null;
  private endpoint?: Endpoint;

  async startHosting(sessionId: string, _playerNames: string, callbacks: TransportCallbacks) {
    this.isHost = true;
    this.attach(sessionId, callbacks);
  }

  async joinSession(sessionId: string, callbacks: TransportCallbacks) {
    this.isHost = false;
    this.attach(sessionId, callbacks);
  }

  async send(event: GameEvent) {
    if (!this.sessionId || !this.endpoint) return;
    const peers = pairedBus.get(this.sessionId);
    if (!peers) return;
    for (const peer of peers) {
      if (peer === this.endpoint) continue;
      queueMicrotask(() => peer.callbacks.onEvent(event));
    }
  }

  async disconnect() {
    if (this.sessionId && this.endpoint) {
      const peers = pairedBus.get(this.sessionId);
      peers?.delete(this.endpoint);
      if (peers && peers.size === 0) pairedBus.delete(this.sessionId);
    }
    this.isHost = false;
    this.sessionId = null;
    this.endpoint = undefined;
  }

  async updateAdvertising(_playerNames: string) {}
  async startBrowsing(_callbacks: DiscoveryCallbacks) {}
  async stopBrowsing() {}

  private attach(sessionId: string, callbacks: TransportCallbacks) {
    this.sessionId = sessionId;
    this.endpoint = { transport: this, callbacks };
    let peers = pairedBus.get(sessionId);
    if (!peers) {
      peers = new Set();
      pairedBus.set(sessionId, peers);
    }
    peers.add(this.endpoint);
  }
}

/**
 * Create the appropriate transport for the current platform.
 *
 * Priority:
 * 1. EXPO_PUBLIC_USE_PAIRED_LOOPBACK=1 → PairedLoopbackTransport (playtest)
 * 2. Supabase env vars present → SupabaseTransport (production)
 * 3. otherwise → LoopbackTransport (offline dev)
 */
export function createTransport(): MultiplayerTransport {
  if (process.env.EXPO_PUBLIC_USE_PAIRED_LOOPBACK === '1') {
    return new PairedLoopbackTransport();
  }

  const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
  const supabaseKey = Constants.expoConfig?.extra?.supabaseAnonKey;

  if (supabaseUrl && supabaseKey) {
    return new SupabaseTransport();
  }

  return new LoopbackTransport();
}
