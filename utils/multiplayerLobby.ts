import type { ConnectionStatus, Player } from '../types/multiplayer';
import { getOnlinePlayers, isPlayerOnline } from './multiplayerPlayers';

export function getReadyOnlinePlayerCount(
  players: Player[],
  readyPlayers: string[],
  connectionStatuses: Record<string, ConnectionStatus>,
): number {
  const readyPlayerIds = new Set(readyPlayers);
  return getOnlinePlayers(players, connectionStatuses)
    .filter(player => readyPlayerIds.has(player.id))
    .length;
}

export function canStartMultiplayerGame(
  isHost: boolean,
  players: Player[],
  readyPlayers: string[],
  connectionStatuses: Record<string, ConnectionStatus>,
): boolean {
  return isHost && getReadyOnlinePlayerCount(players, readyPlayers, connectionStatuses) >= 2;
}

export function getHostTransferCandidates(
  players: Player[],
  allPlayers: Player[],
  selfPlayerId?: string | null,
  connectionStatuses: Record<string, ConnectionStatus> = {},
): Player[] {
  const activePlayersById = new Map(
    players
      .filter((player) => player.id !== selfPlayerId && isPlayerOnline(player, connectionStatuses))
      .map((player) => [player.id, player])
  );

  const orderedPlayers = allPlayers
    .filter((player) => activePlayersById.has(player.id))
    .map((player) => activePlayersById.get(player.id) ?? player);

  const orderedIds = new Set(orderedPlayers.map((player) => player.id));
  const missingPlayers = players.filter(
    (player) => player.id !== selfPlayerId && isPlayerOnline(player, connectionStatuses) && !orderedIds.has(player.id)
  );

  return [...orderedPlayers, ...missingPlayers];
}
