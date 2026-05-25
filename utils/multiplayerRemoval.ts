import type { GameSummary, Player } from '../types/multiplayer';

export type ActivePlayerRemovalState = {
  players: Player[];
  allPlayers: Player[];
  readyPlayers: string[];
  lockedOutPlayers: string[];
  hostId: string | null;
  summary: GameSummary | null;
  currentBuzzerId?: string | null;
  activeBuzzerId?: string | null;
};

export type ActivePlayerRemovalUpdate = {
  players: Player[];
  allPlayers: Player[];
  readyPlayers: string[];
  lockedOutPlayers: string[];
  hostId: string | null;
  summary: GameSummary | null;
  shouldEndGame: boolean;
  wasActiveBuzzer: boolean;
};

export function buildActivePlayerRemovalUpdate(
  playerId: string,
  state: ActivePlayerRemovalState,
  now = Date.now(),
): ActivePlayerRemovalUpdate {
  const remainingPlayers = state.players.filter(player => player.id !== playerId);
  const nextHostId = remainingPlayers.length === 0
    ? null
    : state.hostId && state.hostId !== playerId && remainingPlayers.some(player => player.id === state.hostId)
      ? state.hostId
      : remainingPlayers[0].id;

  const nextSummary = state.summary
    ? {
        ...state.summary,
        hostId: nextHostId ?? state.summary.hostId,
        endedAt: remainingPlayers.length === 0 ? now : state.summary.endedAt,
        players: state.summary.players.map(player =>
          player.id === playerId ? { ...player, status: 'left' as const } : player
        ),
      }
    : null;

  return {
    players: remainingPlayers,
    allPlayers: state.allPlayers.map(player =>
      player.id === playerId ? { ...player, status: 'left' as const } : player
    ),
    readyPlayers: state.readyPlayers.filter(id => id !== playerId),
    lockedOutPlayers: state.lockedOutPlayers.filter(id => id !== playerId),
    hostId: nextHostId,
    summary: nextSummary,
    shouldEndGame: remainingPlayers.length === 0,
    wasActiveBuzzer: state.currentBuzzerId === playerId || state.activeBuzzerId === playerId,
  };
}
