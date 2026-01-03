import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import type { MultiplayerEvent } from '@/types/multiplayer';

/**
 * Lightweight transport layer abstractions for multiplayer sync. Provides a
 * loopback implementation for development and an iOS MultipeerConnectivity
 * transport when the native module is available.
 */

type TransportRole = 'host' | 'client' | null;

export type TransportCallbacks = {
  onEvent: (event: MultiplayerEvent) => void;
  onPeerChange?: (peerIds: string[]) => void;
  onError?: (error: Error) => void;
};

export interface MultiplayerTransport {
  role: TransportRole;
  sessionId: string | null;
  startHosting: (sessionId: string, callbacks: TransportCallbacks) => Promise<void>;
  joinSession: (sessionId: string, callbacks: TransportCallbacks) => Promise<void>;
  send: (event: MultiplayerEvent) => Promise<void>;
  disconnect: () => Promise<void>;
  getConnectedPeerIds: () => string[];
}

const nativeMultipeer = NativeModules.MultipeerSession;

/**
 * iOS-only MultipeerConnectivity transport. Expects a native module named
 * "MultipeerSession" exposing startHosting, joinSession, sendEvent, disconnect,
 * and an event emitter that emits "MultipeerEvent" with a JSON payload.
 */
export class MultipeerTransport implements MultiplayerTransport {
  role: TransportRole = null;
  sessionId: string | null = null;
  private callbacks?: TransportCallbacks;
  private emitter?: NativeEventEmitter;
  private subscription?: { remove: () => void };
  private peerIds: string[] = [];

  private ensureAvailable() {
    if (!nativeMultipeer) {
      throw new Error('MultipeerConnectivity module not available');
    }
  }

  private attachListener(callbacks: TransportCallbacks) {
    if (!nativeMultipeer) return;
    this.emitter = new NativeEventEmitter(nativeMultipeer);
    this.subscription = this.emitter.addListener('MultipeerEvent', (raw: { event: string }) => {
      try {
        const parsed = JSON.parse(raw.event) as MultiplayerEvent;
        callbacks.onEvent(parsed);
      } catch (err) {
        callbacks.onError?.(err as Error);
      }
    });
  }

  async startHosting(sessionId: string, callbacks: TransportCallbacks) {
    this.ensureAvailable();
    this.role = 'host';
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.attachListener(callbacks);
    await nativeMultipeer.startHosting(sessionId);
    this.peerIds = ['self'];
    callbacks.onPeerChange?.(this.peerIds);
  }

  async joinSession(sessionId: string, callbacks: TransportCallbacks) {
    this.ensureAvailable();
    this.role = 'client';
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.attachListener(callbacks);
    await nativeMultipeer.joinSession(sessionId);
    this.peerIds = ['host'];
    callbacks.onPeerChange?.(this.peerIds);
  }

  async send(event: MultiplayerEvent) {
    this.ensureAvailable();
    await nativeMultipeer.sendEvent(JSON.stringify(event));
  }

  async disconnect() {
    this.subscription?.remove();
    this.subscription = undefined;
    this.emitter = undefined;
    if (nativeMultipeer) {
      await nativeMultipeer.disconnect();
    }
    this.role = null;
    this.sessionId = null;
    this.peerIds = [];
  }

  getConnectedPeerIds() {
    return this.peerIds;
  }
}

/**
 * Simple loopback transport for local development. This keeps multiplayer wiring
 * code testable without requiring radios until the real transports are plugged in.
 */
export class LoopbackTransport implements MultiplayerTransport {
  role: TransportRole = null;
  sessionId: string | null = null;
  private callbacks?: TransportCallbacks;
  private peerIds: string[] = [];

  async startHosting(sessionId: string, callbacks: TransportCallbacks) {
    this.role = 'host';
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.peerIds = ['self'];
    this.callbacks.onPeerChange?.(this.peerIds);
  }

  async joinSession(sessionId: string, callbacks: TransportCallbacks) {
    this.role = 'client';
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.peerIds = ['host'];
    this.callbacks.onPeerChange?.(this.peerIds);
  }

  async send(event: MultiplayerEvent) {
    // Immediately loop back the event. Real transports will deliver over radio.
    queueMicrotask(() => {
      this.callbacks?.onEvent(event);
    });
  }

  async disconnect() {
    this.role = null;
    this.sessionId = null;
    this.peerIds = [];
    this.callbacks = undefined;
  }

  getConnectedPeerIds() {
    return this.peerIds;
  }
}

/**
 * Create the appropriate transport for the current platform.
 * - iOS uses MultipeerConnectivity when available
 * - all other platforms fall back to in-memory loopback
 */
export function createTransport(): MultiplayerTransport {
  if (Platform.OS === 'ios' && nativeMultipeer) {
    try {
      return new MultipeerTransport();
    } catch (err) {
      console.warn('Multipeer transport unavailable, falling back to loopback', err);
    }
  }
  return new LoopbackTransport();
}
