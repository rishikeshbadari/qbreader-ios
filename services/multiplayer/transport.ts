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
 * Transport interface for multiplayer communication
 */
export interface MultiplayerTransport {
  readonly isHost: boolean;
  readonly sessionId: string | null;
  startHosting(sessionId: string, callbacks: TransportCallbacks): Promise<void>;
  joinSession(sessionId: string, callbacks: TransportCallbacks): Promise<void>;
  send(event: GameEvent): Promise<void>;
  disconnect(): Promise<void>;
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

  async startHosting(sessionId: string, callbacks: TransportCallbacks) {
    if (!nativeMultipeer) throw new Error('MultipeerConnectivity not available');
    this.isHost = true;
    this.sessionId = sessionId;
    this.attachListener(callbacks);
    await nativeMultipeer.startHosting(sessionId);
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
    this.emitter = undefined;
    if (nativeMultipeer) await nativeMultipeer.disconnect();
    this.isHost = false;
    this.sessionId = null;
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

  async startHosting(sessionId: string, callbacks: TransportCallbacks) {
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
