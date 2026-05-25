export type PresenceEntry = {
  playerId?: string;
  playerName?: string;
};

export type PresenceState = Record<string, PresenceEntry[]>;

export type PresencePlayer = {
  id: string;
  name: string;
};

export type PresenceReconciliation = {
  currentPresencePlayers: Map<string, string>;
  joinedPlayers: PresencePlayer[];
  leftPlayerIds: string[];
};

export function getPresencePlayersFromState(presenceState: PresenceState): Map<string, string> {
  const presencePlayers = new Map<string, string>();

  for (const presences of Object.values(presenceState)) {
    for (const presence of presences) {
      if (!presence.playerId) continue;
      presencePlayers.set(presence.playerId, presence.playerName ?? 'Player');
    }
  }

  return presencePlayers;
}

export function reconcilePresencePlayers(
  previousPresencePlayers: Map<string, string>,
  presenceState: PresenceState,
  selfPlayerId: string | null,
): PresenceReconciliation {
  const currentPresencePlayers = getPresencePlayersFromState(presenceState);
  const joinedPlayers: PresencePlayer[] = [];
  const leftPlayerIds: string[] = [];

  for (const [playerId, playerName] of currentPresencePlayers) {
    if (playerId !== selfPlayerId && !previousPresencePlayers.has(playerId)) {
      joinedPlayers.push({ id: playerId, name: playerName });
    }
  }

  for (const playerId of previousPresencePlayers.keys()) {
    if (playerId !== selfPlayerId && !currentPresencePlayers.has(playerId)) {
      leftPlayerIds.push(playerId);
    }
  }

  return { currentPresencePlayers, joinedPlayers, leftPlayerIds };
}
