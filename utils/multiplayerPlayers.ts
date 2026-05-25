import type { ConnectionStatus, Player } from '../types/multiplayer';

export function isPlayerOnline(
  player: Player,
  connectionStatuses: Record<string, ConnectionStatus>,
): boolean {
  const status = connectionStatuses[player.id];
  return player.status !== 'left' && status !== 'disconnected' && status !== 'reconnecting';
}

export function getOnlinePlayers(
  players: Player[],
  connectionStatuses: Record<string, ConnectionStatus>,
): Player[] {
  return players.filter(player => isPlayerOnline(player, connectionStatuses));
}

export function getCoordinatorPlayerId(
  players: Player[],
  connectionStatuses: Record<string, ConnectionStatus>,
): string | null {
  const activePlayers = players.filter(player => player.status !== 'left');
  if (activePlayers.length === 0) return null;

  const onlinePlayers = getOnlinePlayers(activePlayers, connectionStatuses);
  const eligiblePlayers = onlinePlayers.length > 0 ? onlinePlayers : activePlayers;

  return [...eligiblePlayers].sort((a, b) => a.id.localeCompare(b.id))[0].id;
}
