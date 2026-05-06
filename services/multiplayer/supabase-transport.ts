import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

import type { GameEvent } from '@/types/multiplayer';
import type { MultiplayerTransport, TransportCallbacks, DiscoveryCallbacks } from './transport';
import type { ServerEventCallbacks } from './ws-transport';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Supabase Realtime transport for multiplayer communication.
 *
 * Uses Supabase Realtime Broadcast for game event relay (device-to-device via
 * Supabase's edge infrastructure) and Presence for connection tracking.
 * The `rooms` table is only used to verify game codes exist.
 *
 * No self-hosted server needed — Supabase handles scaling.
 */
export class SupabaseTransport implements MultiplayerTransport {
  isHost = false;
  sessionId: string | null = null;

  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private callbacks?: TransportCallbacks;
  private serverCallbacks?: ServerEventCallbacks;
  private playerId: string | null = null;
  private playerName: string | null = null;

  constructor() {
    const url = Constants.expoConfig?.extra?.supabaseUrl;
    const key = Constants.expoConfig?.extra?.supabaseAnonKey;
    if (!url || !key) {
      throw new Error('Supabase URL and anon key must be set in app.json extra');
    }
    this.supabase = createClient(url, key);
  }

  setServerCallbacks(callbacks: ServerEventCallbacks): void {
    this.serverCallbacks = callbacks;
  }

  setPlayerInfo(playerId: string, playerName: string): void {
    this.playerId = playerId;
    this.playerName = playerName;
  }

  async startHosting(
    _sessionId: string,
    playerNames: string,
    callbacks: TransportCallbacks,
  ): Promise<void> {
    this.isHost = true;
    this.callbacks = callbacks;
    this.playerName = playerNames;

    // Generate a unique game code
    let code: string | null = null;
    for (let attempts = 0; attempts < 10; attempts++) {
      const candidateCode = generateCode();
      const { data, error } = await this.supabase
        .from('rooms')
        .select('code')
        .eq('code', candidateCode)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to verify room code: ${error.message}`);
      }
      if (!data) {
        code = candidateCode;
        break;
      }
    }

    if (!code) {
      throw new Error('Unable to allocate a unique game code. Please try again.');
    }

    // Register room in database
    const { error } = await this.supabase
      .from('rooms')
      .insert({ code });
    if (error) throw new Error(`Failed to create room: ${error.message}`);

    this.sessionId = code;

    // Subscribe to Realtime channel — wait for confirmation before proceeding
    try {
      await this.subscribeToChannel(code);
    } catch (error) {
      await this.supabase.from('rooms').delete().eq('code', code);
      this.sessionId = null;
      this.isHost = false;
      throw error;
    }

    this.serverCallbacks?.onRoomCreated?.(code);
    this.serverCallbacks?.onConnectionStatusChange?.('connected');
  }

  async joinSession(
    sessionId: string,
    callbacks: TransportCallbacks,
  ): Promise<void> {
    const code = sessionId.toUpperCase();
    this.isHost = false;
    this.callbacks = callbacks;

    // Verify room exists
    const { data, error } = await this.supabase
      .from('rooms')
      .select('code')
      .eq('code', code)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to verify room: ${error.message}`);
    }
    if (!data) throw new Error('Room not found');

    this.sessionId = code;

    // Subscribe to Realtime channel — wait for confirmation before proceeding
    await this.subscribeToChannel(code);

    this.serverCallbacks?.onConnectionStatusChange?.('connected');
  }

  async send(event: GameEvent): Promise<void> {
    if (!this.channel) return;
    await this.channel.send({
      type: 'broadcast',
      event: 'relay',
      payload: { event, senderId: this.playerId },
    });
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    // Host cleans up the room row
    if (this.isHost && this.sessionId) {
      await this.supabase.from('rooms').delete().eq('code', this.sessionId);
    }

    this.isHost = false;
    this.sessionId = null;
    this.callbacks = undefined;
    this.serverCallbacks = undefined;
    this.playerId = null;
    this.playerName = null;
  }

  async updateAdvertising(_playerNames: string): Promise<void> {
    // No-op
  }

  async startBrowsing(_callbacks: DiscoveryCallbacks): Promise<void> {
    // No-op: discovery is by game code
  }

  async stopBrowsing(): Promise<void> {
    // No-op
  }

  // ─── Kick & Host Transfer ───────────────────────────────────────────────

  kickPlayer(_targetPlayerId: string): void {
    // Handled via game-level events (player:kick)
  }

  transferHost(_newHostId: string): void {
    // Handled via game-level events (host:transfer)
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private subscribeToChannel(code: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      this.channel = this.supabase.channel(`game:${code}`, {
        config: { broadcast: { self: false } },
      });

      // Game event relay
      this.channel.on('broadcast', { event: 'relay' }, (payload) => {
        try {
          const data = payload.payload as { event: GameEvent; senderId: string };
          this.callbacks?.onEvent(data.event);
        } catch (err) {
          this.callbacks?.onError?.(err as Error);
        }
      });

      // Presence: track player connections
      this.channel.on('presence', { event: 'join' }, ({ newPresences }) => {
        for (const p of newPresences) {
          if (p.playerId && p.playerId !== this.playerId) {
            this.serverCallbacks?.onPlayerJoined?.(p.playerId, p.playerName ?? 'Player');
          }
        }
      });

      this.channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const p of leftPresences) {
          if (p.playerId && p.playerId !== this.playerId) {
            this.serverCallbacks?.onPlayerLeft?.(p.playerId, 'disconnected');
          }
        }
      });

      const timeout = setTimeout(() => {
        settle(() => {
          this.serverCallbacks?.onConnectionStatusChange?.('disconnected');
          reject(new Error('Channel subscription timed out'));
        });
      }, 10_000);

      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            if (this.playerId) {
              await this.channel!.track({
                playerId: this.playerId,
                playerName: this.playerName ?? 'Player',
              });
            }
            settle(resolve);
          } catch (error) {
            settle(() => reject(error instanceof Error ? error : new Error('Presence tracking failed')));
          }
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          settle(() => {
            this.serverCallbacks?.onConnectionStatusChange?.('disconnected');
            reject(new Error(`Channel subscription failed: ${status}`));
          });
        }
      });
    });
  }
}
