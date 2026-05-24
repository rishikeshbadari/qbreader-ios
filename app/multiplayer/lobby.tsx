import { useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';

import { ChipSelector } from '@/components/quiz/ChipSelector';
import { getHostTransferCandidates, HostTransferModal } from '@/components/multiplayer/HostTransferModal';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { GameCodeDisplay } from '@/components/multiplayer/GameCodeDisplay';
import { PlayerListItem } from '@/components/multiplayer/PlayerListItem';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useSettings } from '@/hooks/useSettings';
import { useThemeColor } from '@/hooks/useThemeColor';
import { MAX_PLAYERS, type GameSettings } from '@/types/multiplayer';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

function sortedNumberKey(values: number[]): string {
  return [...values].sort((left, right) => left - right).join(',');
}

function sortedStringKey(values: string[]): string {
  return [...values].sort().join(',');
}

function areSettingsEqual(left: GameSettings | null | undefined, right: GameSettings): boolean {
  if (!left) return false;
  return (
    sortedNumberKey(left.difficulties) === sortedNumberKey(right.difficulties) &&
    sortedStringKey(left.categories) === sortedStringKey(right.categories) &&
    left.revealSpeed === right.revealSpeed
  );
}

function getSelectedDifficultyGroupCount(settings: GameSettings | null, options: { values: number[] }[]): number {
  if (!settings) return 0;
  const selectedValues = new Set(settings.difficulties);
  const selectedGroups = options.filter(option =>
    option.values.every(value => selectedValues.has(value))
  );
  return selectedGroups.length || settings.difficulties.length;
}

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
    updateSettings,
  } = useMultiplayer();
  const { availableCategories, availableDifficulties, revealSpeed } = useSettings();

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const surfaceColor = useThemeColor({}, 'surface');
  const mutedColor = useThemeColor({}, 'muted');
  const textColor = useThemeColor({}, 'text');

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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isViewingSettings, setIsViewingSettings] = useState(false);
  const [tempCategories, setTempCategories] = useState<string[]>([]);
  const [tempDifficulties, setTempDifficulties] = useState<number[]>([]);
  const [tempSpeed, setTempSpeed] = useState(0.5);
  const [isLeavingLobby, setIsLeavingLobby] = useState(false);
  const hasLeftLobbyRef = useRef(false);
  const navigatingToGameRef = useRef(false);
  const leaveGameRef = useRef(leaveGame);
  const leaveOnUnmountRef = useRef({
    status,
    gameCode,
    selfPlayer,
    isLeavingLobby,
  });

  useEffect(() => {
    leaveGameRef.current = leaveGame;
  }, [leaveGame]);

  useEffect(() => {
    leaveOnUnmountRef.current = {
      status,
      gameCode,
      selfPlayer,
      isLeavingLobby,
    };
  }, [gameCode, isLeavingLobby, selfPlayer, status]);

  useEffect(() => () => {
    const latest = leaveOnUnmountRef.current;
    if (
      latest.status === 'lobby' &&
      latest.gameCode &&
      latest.selfPlayer &&
      !latest.isLeavingLobby &&
      !hasLeftLobbyRef.current &&
      !navigatingToGameRef.current
    ) {
      hasLeftLobbyRef.current = true;
      void leaveGameRef.current();
    }
  }, []);

  useEffect(() => {
    if (showHostTransferModal) {
      setSelectedHostId(defaultHostCandidateId);
    }
  }, [defaultHostCandidateId, showHostTransferModal]);

  // Navigate to game when status changes to playing
  useEffect(() => {
    if (status === 'playing' && !hasLeftLobbyRef.current && !isLeavingLobby) {
      navigatingToGameRef.current = true;
      router.replace('/multiplayer/game');
    }
  }, [isLeavingLobby, status, router]);

  const allowLobbyRemoval = useCallback(() => {
    hasLeftLobbyRef.current = true;
    setIsLeavingLobby(true);
  }, []);

  const shouldPreventLobbyRemoval =
    status === 'lobby' &&
    Boolean(gameCode && selfPlayer) &&
    isHost &&
    hostTransferCandidates.length > 0 &&
    !hasLeftLobbyRef.current &&
    !navigatingToGameRef.current &&
    !isLeavingLobby;

  usePreventRemove(shouldPreventLobbyRemoval, () => {
    setSelectedHostId(defaultHostCandidateId);
    setShowHostTransferModal(true);
  });

  useEffect(() => {
    if (!gameCode && status !== 'ended' && !hasLeftLobbyRef.current) {
      router.dismissTo('/(tabs)/multiplayer');
    }
  }, [gameCode, status, router]);

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
            allowLobbyRemoval();
            await leaveGame();
            router.dismissTo('/(tabs)/multiplayer');
          },
        },
      ],
    );
  }, [allowLobbyRemoval, defaultHostCandidateId, hostTransferCandidates.length, isHost, leaveGame, router]);

  const handleConfirmHostTransfer = useCallback(async () => {
    const nextHostId = selectedHostId ?? defaultHostCandidateId;
    if (!nextHostId || isTransferringHost) return;

    setIsTransferringHost(true);
    try {
      await transferHost(nextHostId);
      allowLobbyRemoval();
      await leaveGame();
      setShowHostTransferModal(false);
      router.dismissTo('/(tabs)/multiplayer');
    } finally {
      setIsTransferringHost(false);
    }
  }, [allowLobbyRemoval, defaultHostCandidateId, isTransferringHost, leaveGame, router, selectedHostId, transferHost]);

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

  const prepareSettingsModal = useCallback(() => {
    setTempCategories(settings?.categories ?? availableCategories.map(category => category.name));
    setTempDifficulties(settings?.difficulties ?? availableDifficulties.flatMap(difficulty => difficulty.values));
    setTempSpeed(settings?.revealSpeed ?? revealSpeed);
  }, [availableCategories, availableDifficulties, revealSpeed, settings]);

  const handleOpenSettings = useCallback(() => {
    if (!isHost) return;
    prepareSettingsModal();
    setIsViewingSettings(false);
    setShowSettingsModal(true);
  }, [isHost, prepareSettingsModal]);

  const handleViewSettings = useCallback(() => {
    prepareSettingsModal();
    setIsViewingSettings(true);
    setShowSettingsModal(true);
  }, [prepareSettingsModal]);

  const handleCloseSettingsModal = useCallback(() => {
    setShowSettingsModal(false);
    setIsViewingSettings(false);
  }, []);

  const handleApplySettings = useCallback(async () => {
    const nextSettings: GameSettings = {
      categories: tempCategories.length ? tempCategories : availableCategories.map(category => category.name),
      difficulties: tempDifficulties.length ? tempDifficulties : availableDifficulties.flatMap(difficulty => difficulty.values),
      revealSpeed: tempSpeed,
    };

    handleCloseSettingsModal();
    if (areSettingsEqual(settings, nextSettings)) return;
    await updateSettings(nextSettings, { lobbyOnly: true });
  }, [availableCategories, availableDifficulties, handleCloseSettingsModal, settings, tempCategories, tempDifficulties, tempSpeed, updateSettings]);

  const toggleDifficulty = useCallback((values: number[]) => {
    setTempDifficulties(current => {
      const isSelected = values.every(value => current.includes(value));
      if (isSelected) {
        const next = current.filter(value => !values.includes(value));
        return next.length > 0 ? next : values;
      }
      return [...new Set([...current, ...values])];
    });
  }, []);

  const toggleCategory = useCallback((name: string) => {
    setTempCategories(current => {
      if (current.includes(name)) {
        const next = current.filter(category => category !== name);
        return next.length > 0 ? next : [name];
      }
      return [...current, name].sort();
    });
  }, []);

  const speedLabel =
    (settings?.revealSpeed ?? 0.5) >= 0.95 ? 'Instant'
    : (settings?.revealSpeed ?? 0.5) >= 0.7 ? 'Fast'
    : (settings?.revealSpeed ?? 0.5) >= 0.4 ? 'Moderate'
    : (settings?.revealSpeed ?? 0.5) >= 0.2 ? 'Slow'
    : 'Very slow';
  const selectedDifficultyGroupCount = getSelectedDifficultyGroupCount(settings, availableDifficulties);

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
            <View style={styles.sectionHeaderRow}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Settings</ThemedText>
              {isHost ? (
                <Pressable
                  onPress={handleOpenSettings}
                  accessibilityRole="button"
                  accessibilityLabel="Edit lobby settings"
                  testID="lobby-settings-edit"
                  style={({ pressed }) => [
                    styles.editSettingsButton,
                    { borderColor, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText style={[styles.editSettingsLabel, { color: brandColor }]}>Edit</ThemedText>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleViewSettings}
                  accessibilityRole="button"
                  accessibilityLabel="View lobby settings"
                  testID="lobby-settings-view"
                  style={({ pressed }) => [
                    styles.editSettingsButton,
                    { borderColor, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText style={[styles.editSettingsLabel, { color: brandColor }]}>View</ThemedText>
                </Pressable>
              )}
            </View>
            <View style={styles.settingsRow}>
              <ThemedText style={[styles.settingsLabel, { color: mutedColor }]}>Difficulties</ThemedText>
              <ThemedText style={styles.settingsValue} numberOfLines={1}>
                {selectedDifficultyGroupCount} selected
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

      <Modal visible={showSettingsModal} transparent animationType="slide" onRequestClose={handleCloseSettingsModal}>
        <View style={styles.modalBackdrop}>
          <ThemedView style={[styles.modalCard, { borderColor, paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">Game Settings</ThemedText>
              <ThemedText style={[styles.modalSubtitle, { color: mutedColor }]}>
                {isViewingSettings
                  ? 'These are the host’s current lobby settings.'
                  : 'These settings apply when the game starts.'}
              </ThemedText>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <ChipSelector
                kind="difficulty"
                options={availableDifficulties}
                selected={tempDifficulties}
                onToggle={toggleDifficulty}
                label="Difficulty"
                disabled={isViewingSettings}
              />
              <ChipSelector
                kind="category"
                options={availableCategories}
                selected={tempCategories}
                onToggle={toggleCategory}
                label="Categories"
                disabled={isViewingSettings}
              />

              <View style={styles.modalSection}>
                <ThemedText type="defaultSemiBold" style={styles.modalSectionTitle}>Reveal Speed</ThemedText>
                <Slider
                  value={tempSpeed}
                  minimumValue={0}
                  maximumValue={1}
                  step={0.05}
                  onValueChange={setTempSpeed}
                  disabled={isViewingSettings}
                  minimumTrackTintColor={brandColor}
                  maximumTrackTintColor={borderColor}
                  thumbTintColor={brandColor}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={handleCloseSettingsModal}
                accessibilityRole="button"
                accessibilityLabel={isViewingSettings ? 'Close settings' : 'Cancel settings'}
                testID="lobby-settings-cancel"
                style={[styles.secondaryButton, { borderColor }]}>
                <ThemedText style={{ color: textColor }}>{isViewingSettings ? 'Close' : 'Cancel'}</ThemedText>
              </Pressable>
              {!isViewingSettings ? (
                <Pressable
                  onPress={() => void handleApplySettings()}
                  accessibilityRole="button"
                  accessibilityLabel="Apply lobby settings"
                  testID="lobby-settings-apply"
                  style={[styles.applyButton, { backgroundColor: brandColor }]}>
                  <ThemedText style={styles.applyLabel}>Apply</ThemedText>
                </Pressable>
              ) : null}
            </View>
          </ThemedView>
        </View>
      </Modal>
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editSettingsButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(999),
    paddingHorizontal: spacing.sm,
    paddingVertical: verticalScale(4),
  },
  editSettingsLabel: {
    fontSize: responsiveFont(13),
    fontWeight: '600',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: scale(16),
    borderTopRightRadius: scale(16),
    padding: spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  modalSubtitle: {
    fontSize: responsiveFont(14),
  },
  modalContent: {
    gap: spacing.lg,
    paddingBottom: spacing.md,
  },
  modalSection: {
    gap: spacing.sm,
  },
  modalSectionTitle: {
    fontSize: responsiveFont(15),
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(10),
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(10),
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  applyButton: {
    borderRadius: scale(10),
    paddingHorizontal: spacing.lg,
    paddingVertical: verticalScale(10),
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  applyLabel: {
    color: '#fff',
    fontWeight: '600',
  },
});
