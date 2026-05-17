import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getHostTransferCandidates, HostTransferModal } from '@/components/multiplayer/HostTransferModal';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { GameCodeDisplay } from '@/components/multiplayer/GameCodeDisplay';
import { PlayerListItem } from '@/components/multiplayer/PlayerListItem';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { MAX_PLAYERS } from '@/types/multiplayer';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    gameCode,
    status,
    players,
    allPlayers,
    selfPlayer,
    hostId,
    isHost,
    settings,
    readyPlayers,
    connectionStatuses,
    playerColors,
    countdownSeconds,
    toggleReady,
    kickPlayer,
    transferHost,
    startGameCountdown,
    leaveGame,
  } = useMultiplayer();

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const surfaceColor = useThemeColor({}, 'surface');
  const mutedColor = useThemeColor({}, 'muted');

  const isSelfReady = selfPlayer ? readyPlayers.includes(selfPlayer.id) : false;
  const readyCount = readyPlayers.length;
  const canStart = isHost && readyCount >= 2;
  const hostHint = players.length < 2
    ? 'Waiting for more players to join...'
    : canStart
      ? 'Click Start Game above to begin!'
      : 'At least 2 players must be ready';
  const hostTransferCandidates = useMemo(
    () => getHostTransferCandidates(players, allPlayers, selfPlayer?.id),
    [players, allPlayers, selfPlayer?.id],
  );
  const defaultHostCandidateId = hostTransferCandidates[0]?.id ?? null;
  const [showHostTransferModal, setShowHostTransferModal] = useState(false);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [isTransferringHost, setIsTransferringHost] = useState(false);

  useEffect(() => {
    if (showHostTransferModal) {
      setSelectedHostId(defaultHostCandidateId);
    }
  }, [defaultHostCandidateId, showHostTransferModal]);

  // Navigate to game when status changes to playing
  useEffect(() => {
    if (status === 'playing') {
      router.replace('/multiplayer/game');
    }
  }, [status, router]);

  // Countdown animation
  const countdownOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (countdownSeconds !== null) {
      countdownOpacity.setValue(0);
      Animated.timing(countdownOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [countdownSeconds, countdownOpacity]);

  const handleLeave = useCallback(() => {
    if (isHost && hostTransferCandidates.length > 0) {
      setSelectedHostId(defaultHostCandidateId);
      setShowHostTransferModal(true);
      return;
    }

    Alert.alert(
      'Leave Game',
      isHost
        ? 'Leave this game?'
        : 'Are you sure you want to leave the game?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await leaveGame();
            router.replace('/multiplayer');
          },
        },
      ],
    );
  }, [defaultHostCandidateId, hostTransferCandidates.length, isHost, leaveGame, router]);

  const handleConfirmHostTransfer = useCallback(async () => {
    const nextHostId = selectedHostId ?? defaultHostCandidateId;
    if (!nextHostId || isTransferringHost) return;

    setIsTransferringHost(true);
    try {
      await transferHost(nextHostId);
      await leaveGame();
      setShowHostTransferModal(false);
      router.replace('/multiplayer');
    } finally {
      setIsTransferringHost(false);
    }
  }, [defaultHostCandidateId, isTransferringHost, leaveGame, router, selectedHostId, transferHost]);

  const handleKick = useCallback((playerId: string, playerName: string) => {
    Alert.alert(
      'Remove Player',
      `Remove ${playerName} from the game?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => kickPlayer(playerId) },
      ],
    );
  }, [kickPlayer]);

  const handleTransferHost = useCallback((playerId: string, playerName: string) => {
    Alert.alert(
      'Transfer Host',
      `Make ${playerName} the new host?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Transfer', onPress: () => transferHost(playerId) },
      ],
    );
  }, [transferHost]);

  const speedLabel =
    (settings?.revealSpeed ?? 0.5) >= 0.95 ? 'Instant'
    : (settings?.revealSpeed ?? 0.5) >= 0.7 ? 'Fast'
    : (settings?.revealSpeed ?? 0.5) >= 0.4 ? 'Moderate'
    : (settings?.revealSpeed ?? 0.5) >= 0.2 ? 'Slow'
    : 'Very slow';

  // Countdown overlay
  if (countdownSeconds !== null) {
    return (
      <ThemedView style={styles.countdownContainer}>
        <Animated.View style={{ opacity: countdownOpacity }}>
          <ThemedText style={styles.countdownNumber}>
            {countdownSeconds}
          </ThemedText>
          <ThemedText style={[styles.countdownLabel, { color: mutedColor }]}>
            Game starting...
          </ThemedText>
        </Animated.View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      {/* Header */}
      <View style={styles.headerSection}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleLeave}
            accessibilityRole="button"
            accessibilityLabel="Leave game"
            testID="lobby-leave"
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText style={styles.backLabel}>&#8249; Leave</ThemedText>
          </Pressable>
          <ThemedText style={[styles.playerCount, { color: mutedColor }]}>
            {players.length}/{MAX_PLAYERS} players
          </ThemedText>
        </View>
        <ThemedText type="title">Lobby</ThemedText>
      </View>

      {/* Game Code */}
      <View style={styles.codeSection}>
        <GameCodeDisplay code={gameCode} />
      </View>

      <View style={styles.lobbyBody}>
        {/* Player List */}
        <View style={[styles.playerSection, { borderColor, backgroundColor: surfaceColor }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Players</ThemedText>
          <FlatList
            data={players}
            keyExtractor={p => p.id}
            renderItem={({ item }) => (
              <Pressable
                onLongPress={() => {
                  if (isHost && item.id !== selfPlayer?.id) {
                    handleTransferHost(item.id, item.name);
                  }
                }}
                delayLongPress={500}
                accessibilityLabel={`Player ${item.name}${isHost && item.id !== selfPlayer?.id ? ' (long press to transfer host)' : ''}`}
                testID={`player-row-${item.id}`}>
                <PlayerListItem
                  name={item.name}
                  color={playerColors[item.id] ?? '#888'}
                  isHost={item.id === hostId}
                  isSelf={item.id === selfPlayer?.id}
                  isReady={readyPlayers.includes(item.id)}
                  connectionStatus={connectionStatuses[item.id]}
                  canKick={isHost && item.id !== selfPlayer?.id}
                  onKick={() => handleKick(item.id, item.name)}
                />
              </Pressable>
            )}
            style={styles.playerList}
            contentContainerStyle={styles.playerListContent}
            nestedScrollEnabled
            scrollEnabled
            showsVerticalScrollIndicator={players.length > 4}
          />
        </View>

        {/* Settings Summary */}
        {settings && (
          <View style={[styles.settingsSection, { borderColor, backgroundColor: surfaceColor }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Settings</ThemedText>
            <View style={styles.settingsRow}>
              <ThemedText style={[styles.settingsLabel, { color: mutedColor }]}>Difficulties</ThemedText>
              <ThemedText style={styles.settingsValue} numberOfLines={1}>
                {settings.difficulties.length} selected
              </ThemedText>
            </View>
            <View style={styles.settingsRow}>
              <ThemedText style={[styles.settingsLabel, { color: mutedColor }]}>Categories</ThemedText>
              <ThemedText style={styles.settingsValue} numberOfLines={1}>
                {settings.categories.length} selected
              </ThemedText>
            </View>
            <View style={styles.settingsRow}>
              <ThemedText style={[styles.settingsLabel, { color: mutedColor }]}>Speed</ThemedText>
              <ThemedText style={styles.settingsValue}>{speedLabel}</ThemedText>
            </View>
          </View>
        )}
      </View>

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + spacing.xl }]}>
        {isHost ? (
          <View style={styles.hostActions}>
            <Pressable
              onPress={startGameCountdown}
              disabled={!canStart}
              accessibilityRole="button"
              accessibilityLabel="Start game"
              accessibilityState={{ disabled: !canStart }}
              testID="lobby-start-game"
              style={({ pressed }) => [
                styles.startButton,
                {
                  backgroundColor: brandColor,
                  opacity: !canStart ? 0.4 : pressed ? 0.8 : 1,
                },
              ]}>
              <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>
                Start Game
              </ThemedText>
            </Pressable>
            <View style={styles.hintSlot}>
              <ThemedText style={[styles.hint, { color: mutedColor }]}>
                {hostHint}
              </ThemedText>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={toggleReady}
            accessibilityRole="button"
            accessibilityLabel={isSelfReady ? 'Mark not ready' : 'Mark ready'}
            accessibilityState={{ selected: isSelfReady }}
            testID="lobby-ready-toggle"
            style={({ pressed }) => [
              styles.readyButton,
              {
                backgroundColor: isSelfReady ? 'transparent' : brandColor,
                borderColor: isSelfReady ? brandColor : 'transparent',
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            <ThemedText
              type="defaultSemiBold"
              style={[styles.buttonLabel, { color: isSelfReady ? brandColor : '#fff' }]}>
              {isSelfReady ? 'Not Ready' : 'Ready'}
            </ThemedText>
          </Pressable>
        )}
      </View>

      <HostTransferModal
        visible={showHostTransferModal}
        players={hostTransferCandidates}
        selectedPlayerId={selectedHostId}
        defaultPlayerId={defaultHostCandidateId}
        isSubmitting={isTransferringHost}
        onSelectPlayer={setSelectedHostId}
        onCancel={() => setShowHostTransferModal(false)}
        onConfirm={handleConfirmHostTransfer}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  countdownContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownNumber: {
    fontSize: responsiveFont(96),
    lineHeight: responsiveFont(112),
    fontWeight: '900',
    textAlign: 'center',
    width: scale(120),
  },
  countdownLabel: {
    fontSize: responsiveFont(18),
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  headerSection: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    paddingVertical: verticalScale(4),
  },
  backLabel: {
    fontSize: responsiveFont(16),
  },
  playerCount: {
    fontSize: responsiveFont(14),
  },
  codeSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  lobbyBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  playerSection: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(18),
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: verticalScale(180),
  },
  sectionTitle: {
    fontSize: responsiveFont(16),
  },
  playerList: {
    flex: 1,
  },
  playerListContent: {
    paddingBottom: spacing.xs,
  },
  settingsSection: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(18),
    padding: spacing.md,
    gap: spacing.xs,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsLabel: {
    fontSize: responsiveFont(13),
  },
  settingsValue: {
    fontSize: responsiveFont(13),
    fontWeight: '500',
  },
  bottomActions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  hostActions: {
    gap: spacing.xs,
    alignItems: 'center',
  },
  startButton: {
    width: '100%',
    borderRadius: scale(12),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  readyButton: {
    borderRadius: scale(12),
    borderWidth: scale(2),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  buttonLabel: {
    fontSize: responsiveFont(16),
    color: '#fff',
  },
  hint: {
    fontSize: responsiveFont(13),
    textAlign: 'center',
  },
  hintSlot: {
    minHeight: verticalScale(18),
    justifyContent: 'center',
  },
});
