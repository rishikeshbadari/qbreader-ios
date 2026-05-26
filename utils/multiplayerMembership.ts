import type { ConnectionStatus, GameSummary, Player } from '../types/multiplayer';

export function uniquePlayersById(players: Player[]): Player[] {
  const order: string[] = [];
  const byId = new Map<string, Player>();

  for (const player of players) {
    if (!byId.has(player.id)) {
      order.push(player.id);
    }
    byId.set(player.id, { ...byId.get(player.id), ...player });
  }

  return order.map(id => byId.get(id)!);
}

export type AuthoritativePlayersState = {
  players: Player[];
  allPlayers: Player[];
  readyPlayers: string[];
  lockedOutPlayers: string[];
  connectionStatuses: Record<string, ConnectionStatus>;
  hostId: string | null;
  summary: GameSummary | null;
  currentBuzzerId?: string | null;
  activeBuzzerId?: string | null;
};

export type AuthoritativePlayersUpdate = {
  players: Player[];
  allPlayers: Player[];
  readyPlayers: string[];
  lockedOutPlayers: string[];
  connectionStatuses: Record<string, ConnectionStatus>;
  hostId: string | null;
  summary: GameSummary | null;
  removedPlayerIds: string[];
  shouldEndGame: boolean;
  wasActiveBuzzer: boolean;
};

function orderAuthoritativePlayers(previousPlayers: Player[], authoritativePlayers: Player[]): Player[] {
  const incoming = uniquePlayersById(authoritativePlayers)
    .filter(player => player.id && player.status !== 'left')
    .map(player => ({ ...player, status: 'active' as const }));
  const incomingById = new Map(incoming.map(player => [player.id, player]));
  const previousById = new Map(previousPlayers.map(player => [player.id, player]));
  const orderedIds: string[] = [];

  for (const player of previousPlayers) {
    if (incomingById.has(player.id)) {
      orderedIds.push(player.id);
    }
  }

  for (const player of incoming) {
    if (!orderedIds.includes(player.id)) {
      orderedIds.push(player.id);
    }
  }

  return orderedIds.map(id => ({
    ...previousById.get(id),
    ...incomingById.get(id)!,
    status: 'active' as const,
  }));
}

export function buildAuthoritativePlayersUpdate(
  authoritativePlayers: Player[],
  state: AuthoritativePlayersState,
  hostId = state.hostId,
  now = Date.now(),
): AuthoritativePlayersUpdate {
  const nextPlayers = orderAuthoritativePlayers(state.players, authoritativePlayers);
  const nextPlayerIds = new Set(nextPlayers.map(player => player.id));
  const removedPlayerIds = state.players
    .filter(player => !nextPlayerIds.has(player.id))
    .map(player => player.id);
  const removedPlayerIdSet = new Set(removedPlayerIds);
  const nextHostId =
    hostId && nextPlayerIds.has(hostId)
      ? hostId
      : nextPlayers[0]?.id ?? null;
  const markRemoved = (player: Player): Player =>
    removedPlayerIdSet.has(player.id) ? { ...player, status: 'left' as const } : player;
  const nextAllPlayers = uniquePlayersById([
    ...state.allPlayers.map(markRemoved),
    ...nextPlayers,
  ]);
  const nextSummary = state.summary
    ? {
        ...state.summary,
        hostId: nextHostId ?? state.summary.hostId,
        endedAt: nextPlayers.length === 0 ? now : state.summary.endedAt,
        players: uniquePlayersById([
          ...state.summary.players.map(markRemoved),
          ...nextPlayers,
        ]),
      }
    : null;
  const nextConnectionStatuses = { ...state.connectionStatuses };

  for (const playerId of removedPlayerIds) {
    nextConnectionStatuses[playerId] = 'disconnected';
  }

  for (const player of nextPlayers) {
    nextConnectionStatuses[player.id] = 'connected';
  }

  return {
    players: nextPlayers,
    allPlayers: nextAllPlayers,
    readyPlayers: state.readyPlayers.filter(id => nextPlayerIds.has(id)),
    lockedOutPlayers: state.lockedOutPlayers.filter(id => nextPlayerIds.has(id)),
    connectionStatuses: nextConnectionStatuses,
    hostId: nextHostId,
    summary: nextSummary,
    removedPlayerIds,
    shouldEndGame: nextPlayers.length === 0,
    wasActiveBuzzer: Boolean(
      (state.currentBuzzerId && removedPlayerIdSet.has(state.currentBuzzerId)) ||
      (state.activeBuzzerId && removedPlayerIdSet.has(state.activeBuzzerId))
    ),
  };
}
