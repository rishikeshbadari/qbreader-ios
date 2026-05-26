import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

import type { GameEvent } from '@/types/multiplayer';
import { reconcilePresencePlayers, type PresenceState } from '@/utils/multiplayerPresence';
import type { MultiplayerTransport, TransportCallbacks, DiscoveryCallbacks } from './transport';
import type { ServerEventCallbacks } from './ws-transport';

type RoomCreationResponse = {
  code: string;
  host_token: string;
};

type PushableRealtimeChannel = RealtimeChannel & {
  channelAdapter?: {
    canPush: () => boolean;
  };
};

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
  private hostToken: string | null = null;
  private subscriptionPromise: Promise<void> | null = null;
  private presencePlayers = new Map<string, string>();

  constructor() {
    const url = Constants.expoConfig?.extra?.supabaseUrl;
    const key = Constants.expoConfig?.extra?.supabaseAnonKey;
    if (!url || !key) {
      throw new Error('Supabase URL and anon key must be set in app.json extra');
    }
    this.supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      db: { timeout: 8_000 },
    });
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

    const { code, host_token: hostToken } = await this.createRoom();
    this.sessionId = code;
    this.hostToken = hostToken;

    // Subscribe to Realtime channel — wait for confirmation before proceeding
    try {
      this.subscriptionPromise = this.subscribeToChannel(code);
      await this.subscriptionPromise;
    } catch (error) {
      await this.deleteHostedRoom();
      this.sessionId = null;
      this.hostToken = null;
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
    const code = sessionId.trim().toUpperCase();
    this.isHost = false;
    this.callbacks = callbacks;
    this.hostToken = null;

    this.sessionId = code;

    const subscriptionPromise = this.subscribeToChannel(code);
    this.subscriptionPromise = subscriptionPromise;
    subscriptionPromise.catch(() => undefined);

    try {
      const exists = await this.roomExists(code);
      if (!exists) {
        await this.closeChannel();
        await subscriptionPromise.catch(() => undefined);
        throw new Error('Room not found');
      }

      await subscriptionPromise;
    } catch (error) {
      await this.closeChannel();
      this.sessionId = null;
      throw error;
    }

    this.serverCallbacks?.onConnectionStatusChange?.('connected');
  }

  async send(event: GameEvent): Promise<void> {
    if (!this.channel) return;
    await this.subscriptionPromise;

    const payload = { event, senderId: this.playerId };
    const channel = this.channel;
    const canPush = (channel as PushableRealtimeChannel).channelAdapter?.canPush?.() ?? channel.state === 'joined';

    if (!canPush) {
      await channel.httpSend('relay', payload);
      return;
    }

    await channel.send({
      type: 'broadcast',
      event: 'relay',
      payload,
    });
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    // Host cleans up the room row
    await this.deleteHostedRoom();

    this.isHost = false;
    this.sessionId = null;
    this.hostToken = null;
    this.callbacks = undefined;
    this.serverCallbacks = undefined;
    this.playerId = null;
    this.playerName = null;
    this.presencePlayers.clear();
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

  transferHost(newHostId: string): void {
    if (newHostId !== this.playerId) {
      this.isHost = false;
      this.hostToken = null;
    }
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private async createRoom(): Promise<RoomCreationResponse> {
    const { data, error } = await this.supabase.rpc('create_room').single();
    if (error) throw new Error(`Failed to create room: ${error.message}`);

    const room = data as RoomCreationResponse | null;
    if (!room?.code || !room.host_token) {
      throw new Error('Failed to create room: invalid Supabase response');
    }

    return room;
  }

  private async roomExists(code: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('room_exists', { p_code: code });
    if (error) throw new Error(`Failed to verify room: ${error.message}`);
    return data === true;
  }

  private async deleteHostedRoom(): Promise<void> {
    if (!this.isHost || !this.sessionId || !this.hostToken) return;

    const { error } = await this.supabase.rpc('delete_room', {
      p_code: this.sessionId,
      p_host_token: this.hostToken,
    });

    if (error) {
      console.warn('Failed to delete room:', error.message);
    }
  }

  private async closeChannel(): Promise<void> {
    if (!this.channel) return;
    const channel = this.channel;
    this.channel = null;
    this.subscriptionPromise = null;
    this.presencePlayers.clear();
    await this.supabase.removeChannel(channel);
  }

  private reconcilePresenceState(): void {
    if (!this.channel) return;

    const presenceState = this.channel.presenceState() as PresenceState;
    const reconciliation = reconcilePresencePlayers(
      this.presencePlayers,
      presenceState,
      this.playerId,
    );

    for (const player of reconciliation.joinedPlayers) {
      this.serverCallbacks?.onPlayerJoined?.(player.id, player.name);
    }

    for (const playerId of reconciliation.leftPlayerIds) {
      this.serverCallbacks?.onPlayerLeft?.(playerId, 'disconnected');
    }

    this.serverCallbacks?.onPresenceSync?.(
      Array.from(reconciliation.currentPresencePlayers, ([id, name]) => ({ id, name })),
    );

    this.presencePlayers = reconciliation.currentPresencePlayers;
  }

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
        config: {
          broadcast: { ack: false, self: false },
          presence: this.playerId ? { key: this.playerId } : undefined,
        },
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
      this.channel.on('presence', { event: 'sync' }, () => {
        this.reconcilePresenceState();
      });

      this.channel.on('presence', { event: 'join' }, ({ newPresences }) => {
        for (const p of newPresences) {
          if (p.playerId && p.playerId !== this.playerId) {
            this.serverCallbacks?.onPlayerJoined?.(p.playerId, p.playerName ?? 'Player');
          }
        }
      });

      this.channel.on('presence', { event: 'leave' }, () => {
        this.reconcilePresenceState();
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
              this.reconcilePresenceState();
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
