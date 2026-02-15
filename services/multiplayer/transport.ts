import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import type { GameEvent } from '@/types/multiplayer';

/**
 * Callbacks for transport events
 */
export type TransportCallbacks = {
  onEvent: (event: GameEvent) => void;
  onError?: (error: Error) => void;
};

/**
 * A discovered nearby game session
 */
export type DiscoveredSession = {
  sessionId: string;
  players: string[];
};

/**
 * Callbacks for peer discovery events
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

const nativeMultipeer = NativeModules.MultipeerSession;

/**
 * iOS MultipeerConnectivity transport
 */
class MultipeerTransport implements MultiplayerTransport {
  isHost = false;
  sessionId: string | null = null;
  private emitter?: NativeEventEmitter;
  private subscription?: { remove: () => void };
  private discoverySubscription?: { remove: () => void };

  async startHosting(sessionId: string, playerNames: string, callbacks: TransportCallbacks) {
    if (!nativeMultipeer) throw new Error('MultipeerConnectivity not available');
    this.isHost = true;
    this.sessionId = sessionId;
    this.attachListener(callbacks);
    await nativeMultipeer.startHosting(sessionId, playerNames);
  }

  async joinSession(sessionId: string, callbacks: TransportCallbacks) {
    if (!nativeMultipeer) throw new Error('MultipeerConnectivity not available');
    this.isHost = false;
    this.sessionId = sessionId;
    this.attachListener(callbacks);
    await nativeMultipeer.joinSession(sessionId);
  }

  async send(event: GameEvent) {
    if (!nativeMultipeer) throw new Error('MultipeerConnectivity not available');
    await nativeMultipeer.sendEvent(JSON.stringify(event));
  }

  async disconnect() {
    this.subscription?.remove();
    this.subscription = undefined;
    this.discoverySubscription?.remove();
    this.discoverySubscription = undefined;
    this.emitter = undefined;
    if (nativeMultipeer) await nativeMultipeer.disconnect();
    this.isHost = false;
    this.sessionId = null;
  }

  async updateAdvertising(playerNames: string) {
    if (!nativeMultipeer) return;
    await nativeMultipeer.updateAdvertising(playerNames);
  }

  async startBrowsing(callbacks: DiscoveryCallbacks) {
    if (!nativeMultipeer) throw new Error('MultipeerConnectivity not available');
    const emitter = new NativeEventEmitter(nativeMultipeer);
    this.discoverySubscription = emitter.addListener(
      'MultipeerDiscovery',
      (raw: { type: string; sessionId: string; players: string }) => {
        if (raw.type === 'found') {
          callbacks.onSessionFound({
            sessionId: raw.sessionId,
            players: raw.players ? raw.players.split(',').filter(Boolean) : [],
          });
        } else if (raw.type === 'lost') {
          callbacks.onSessionLost(raw.sessionId);
        }
      },
    );
    await nativeMultipeer.startBrowsing();
  }

  async stopBrowsing() {
    this.discoverySubscription?.remove();
    this.discoverySubscription = undefined;
    if (nativeMultipeer) await nativeMultipeer.stopBrowsing();
  }

  private attachListener(callbacks: TransportCallbacks) {
    if (!nativeMultipeer) return;
    this.emitter = new NativeEventEmitter(nativeMultipeer);
    this.subscription = this.emitter.addListener('MultipeerEvent', (raw: { event: string }) => {
      try {
        callbacks.onEvent(JSON.parse(raw.event) as GameEvent);
      } catch (err) {
        callbacks.onError?.(err as Error);
      }
    });
  }
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

/**
 * Create the appropriate transport for the current platform
 */
export function createTransport(): MultiplayerTransport {
  if (Platform.OS === 'ios' && nativeMultipeer) {
    try {
      return new MultipeerTransport();
    } catch {
      console.warn('Multipeer unavailable, using loopback');
    }
  }
  return new LoopbackTransport();
}
