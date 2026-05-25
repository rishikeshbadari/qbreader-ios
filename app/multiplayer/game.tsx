import { useRootNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';

import { HostTransferModal } from '@/components/multiplayer/HostTransferModal';
import { ChipSelector } from '@/components/quiz/ChipSelector';
import { QuizGameLayout } from '@/components/quiz/QuizGameLayout';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useSettings } from '@/hooks/useSettings';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { GameSettings } from '@/types/multiplayer';
import { resetToMultiplayerHome } from '@/utils/navigation';
import { getHostTransferCandidates } from '@/utils/multiplayerLobby';
import { getOnlinePlayers } from '@/utils/multiplayerPlayers';
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

export default function MultiplayerGameScreen() {
  const router = useRouter();
  const rootNavigation = useRootNavigation();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const {
    gameCode,
    sessionId,
    status,
    players,
    allPlayers,
    settings,
    pendingSettings,
    currentQuestion,
    currentResult,
    currentBuzzer,
    isLoading,
    isBuzzLocked,
    isSelfLockedOut,
    selfPlayer,
    scores,
    isHost,
    buzzTimerEnd,
    revealStartTime,
    buzzQueuePosition,
    startNextQuestion,
    buzzIn,
    submitBuzzAnswer,
    sendBuzzTyping,
    syncRevealWordIndex,
    buzzerAnswer,
    buzzerResult,
    promptText,
    pausedByPlayerId,
    pausedByName,
    reviewSecondsRemaining,
    reviewPausedByPlayerId,
    reviewPausedByName,
    connectionStatuses,
    noBuzzTimeout,
    pauseGame,
    resumeGame,
    pauseReview,
    resumeReview,
    updateSettings,
    transferHost,
    leaveGame,
  } = useMultiplayer();

  // Auto-navigate to summary when game ends (e.g., when another player leaves)
  useEffect(() => {
    if (status === 'ended') {
      router.replace('/multiplayer/summary');
    }
  }, [status, router]);

  useEffect(() => {
    if (!sessionId && status !== 'ended') {
      resetToMultiplayerHome(rootNavigation, () => router.replace('/(tabs)/multiplayer'));
    }
  }, [rootNavigation, sessionId, status, router]);

  const { availableCategories, availableDifficulties, revealSpeed } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showHostTransferModal, setShowHostTransferModal] = useState(false);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [isTransferringHost, setIsTransferringHost] = useState(false);
  const [settingsPauseMode, setSettingsPauseMode] = useState<'game' | 'review' | null>(null);

  // Temp settings state for modal
  const [tempCategories, setTempCategories] = useState<string[]>([]);
  const [tempDifficulties, setTempDifficulties] = useState<number[]>([]);
  const [tempSpeed, setTempSpeed] = useState(0.5);

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const surfaceColor = useThemeColor({}, 'surface');
  const successColor = useThemeColor({}, 'success');
  const errorColor = useThemeColor({}, 'error');

  const isPlaying = status === 'playing';
  const selfScore = selfPlayer ? (scores[selfPlayer.id] ?? 0) : 0;
  const effectiveSettings = pendingSettings ?? settings;
  const onlinePlayerCount = useMemo(
    () => getOnlinePlayers(players, connectionStatuses).length,
    [connectionStatuses, players],
  );
  const hasActiveUnresolvedQuestion = Boolean(status !== 'ended' && currentQuestion && !currentResult);
  const settingsLockedForActiveBuzz = Boolean(
    isPlaying &&
    currentQuestion &&
    !currentResult &&
    (isBuzzLocked || currentBuzzer)
  );
  const hostTransferCandidates = useMemo(
    () => getHostTransferCandidates(players, allPlayers, selfPlayer?.id, connectionStatuses),
    [players, allPlayers, selfPlayer?.id, connectionStatuses],
  );
  const defaultHostCandidateId = hostTransferCandidates[0]?.id ?? null;

  useEffect(() => {
    if (showHostTransferModal) {
      setSelectedHostId(defaultHostCandidateId);
    }
  }, [defaultHostCandidateId, showHostTransferModal]);

  const handleOpenSettings = async () => {
    if (!isHost || settingsLockedForActiveBuzz) return;
    if (currentResult) {
      if (!reviewPausedByPlayerId && reviewSecondsRemaining != null) {
        await pauseReview();
        setSettingsPauseMode('review');
      } else {
        setSettingsPauseMode(null);
      }
    } else {
      await pauseGame();
      setSettingsPauseMode('game');
    }
    setTempCategories(effectiveSettings?.categories ?? availableCategories.map(c => c.name));
    setTempDifficulties(effectiveSettings?.difficulties ?? availableDifficulties.flatMap(d => d.values));
    setTempSpeed(effectiveSettings?.revealSpeed ?? revealSpeed);
    setShowSettings(true);
  };

  const handleApplySettings = async () => {
    const nextSettings = {
      categories: tempCategories.length ? tempCategories : availableCategories.map(c => c.name),
      difficulties: tempDifficulties.length ? tempDifficulties : availableDifficulties.flatMap(d => d.values),
      revealSpeed: tempSpeed,
    };

    setShowSettings(false);

    if (areSettingsEqual(effectiveSettings, nextSettings)) {
      if (settingsPauseMode === 'review') {
        await resumeReview();
      } else if (settingsPauseMode === 'game') {
        await resumeGame();
      }
      setSettingsPauseMode(null);
      return;
    }

    if (currentResult) {
      await updateSettings(nextSettings, { deferUntilNextQuestion: true });
      if (settingsPauseMode === 'review') {
        await resumeReview();
      }
      setSettingsPauseMode(null);
      return;
    }

    if (hasActiveUnresolvedQuestion) {
      await updateSettings(nextSettings, { deferUntilNextQuestion: true });
      await resumeGame();
      setSettingsPauseMode(null);
      return;
    }

    await updateSettings(nextSettings);
    await startNextQuestion();
    setSettingsPauseMode(null);
  };

  const handleCancelSettings = async () => {
    setShowSettings(false);
    if (settingsPauseMode === 'review') {
      await resumeReview();
    } else if (settingsPauseMode === 'game') {
      await resumeGame();
    }
    setSettingsPauseMode(null);
  };

  const handleLeave = async () => {
    if (isHost && hostTransferCandidates.length > 0) {
      setSelectedHostId(defaultHostCandidateId);
      setShowHostTransferModal(true);
      return;
    }

    await leaveGame();
    router.replace('/multiplayer/summary');
  };

  const handleShareGameCode = async () => {
    if (!gameCode) return;
    const joinUrl = `qbreader://join/${gameCode}`;
    await Share.share({
      message: `Join my QBReader game! Code: ${gameCode}\n${joinUrl}`,
    });
  };

  const handleConfirmHostTransfer = async () => {
    const nextHostId = selectedHostId ?? defaultHostCandidateId;
    if (!nextHostId || isTransferringHost) return;

    setIsTransferringHost(true);
    try {
      await transferHost(nextHostId);
      await leaveGame();
      setShowHostTransferModal(false);
      router.replace('/multiplayer/summary');
    } finally {
      setIsTransferringHost(false);
    }
  };

  const toggleDifficulty = (values: number[]) => {
    const isSelected = values.every(v => tempDifficulties.includes(v));
    if (isSelected) {
      const next = tempDifficulties.filter(v => !values.includes(v));
      setTempDifficulties(next.length > 0 ? next : values);
    } else {
      setTempDifficulties([...new Set([...tempDifficulties, ...values])]);
    }
  };

  const toggleCategory = (name: string) => {
    const isSelected = tempCategories.includes(name);
    if (isSelected) {
      const next = tempCategories.filter(c => c !== name);
      setTempCategories(next.length > 0 ? next : [name]);
    } else {
      setTempCategories([...tempCategories, name].sort());
    }
  };

  // Overlay for non-playing states
  const overlayBackground = colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
  const overlayTextColor = colorScheme === 'dark' ? '#fff' : '#0f172a';

  // Another player is changing settings (not us)
  const otherPlayerChangingSettings = Boolean(
    status === 'paused' &&
    (
      (pausedByPlayerId && pausedByPlayerId !== selfPlayer?.id) ||
      (!pausedByPlayerId && pausedByName && pausedByName !== selfPlayer?.name)
    )
  );
  const showPausedOverlay = status === 'paused' && !showSettings;
  const waitingForHostToStart = isPlaying && !currentQuestion && !isLoading && !isHost;
  // Only show overlay for pause states — lobby is handled by the lobby screen
  const showOverlay = (isPlaying && !currentQuestion && !isLoading) || showPausedOverlay;
  const isReviewPaused = Boolean(reviewPausedByPlayerId || reviewPausedByName);
  const reviewPausedLabel =
    reviewPausedByPlayerId === selfPlayer?.id
      ? 'Paused by you'
      : reviewPausedByName
        ? `Paused by ${reviewPausedByName}`
        : 'Paused';
  const reviewAccessory = currentResult ? (
    <View style={[styles.reviewPanel, { borderColor, backgroundColor: surfaceColor }]}>
      <View style={styles.reviewTextBlock}>
        <ThemedText type="defaultSemiBold" style={styles.reviewTitle}>
          {isReviewPaused
            ? reviewPausedLabel
            : reviewSecondsRemaining != null
              ? `Next question in ${reviewSecondsRemaining}s`
              : 'Preparing next question...'}
        </ThemedText>
        <ThemedText style={[styles.reviewSubtitle, { color: mutedColor }]}>
          {isReviewPaused ? 'Resume when everyone is ready.' : 'Pause if you want more time to read.'}
        </ThemedText>
      </View>
      <Pressable
        onPress={isReviewPaused ? resumeReview : pauseReview}
        disabled={!isReviewPaused && reviewSecondsRemaining == null}
        accessibilityRole="button"
        accessibilityLabel={isReviewPaused ? 'Resume review countdown' : 'Pause review countdown'}
        testID={isReviewPaused ? 'review-resume-button' : 'review-pause-button'}
        style={({ pressed }) => [
          styles.reviewButton,
          {
            borderColor,
            backgroundColor: isReviewPaused ? brandColor : 'transparent',
            opacity: !isReviewPaused && reviewSecondsRemaining == null ? 0.4 : pressed ? 0.75 : 1,
          },
        ]}>
        <ThemedText
          type="defaultSemiBold"
          style={[
            styles.reviewButtonText,
            { color: isReviewPaused ? '#fff' : textColor },
          ]}>
          {isReviewPaused ? 'Resume' : 'Pause'}
        </ThemedText>
      </Pressable>
    </View>
  ) : null;

  return (
    <ThemedView style={[styles.gameContainer, { paddingTop: insets.top }]}>
      <QuizGameLayout
        key={currentQuestion?.id ?? currentQuestion?.question ?? 'empty-question'}
        title="Multiplayer"
        subtitle={null}
        showHeader={false}
        topAccessory={
          <View style={[styles.gameHud, { borderColor, backgroundColor: surfaceColor }]}>
            <View style={styles.hudTopRow}>
              <View style={styles.hudStats}>
                <ThemedText style={[styles.hudStat, { color: mutedColor }]}>
                  {onlinePlayerCount} online
                </ThemedText>
                <View style={[styles.hudDivider, { backgroundColor: borderColor }]} />
                <ThemedText
                  type="defaultSemiBold"
                  style={[styles.hudScore, { color: selfScore >= 0 ? successColor : errorColor }]}>
                  {selfScore} pts
                </ThemedText>
              </View>
              <View style={styles.hudActions}>
                {isHost ? (
                  <Pressable
                    onPress={handleOpenSettings}
                    disabled={settingsLockedForActiveBuzz}
                    accessibilityRole="button"
                    accessibilityLabel={
                      settingsLockedForActiveBuzz
                        ? 'Game settings locked during active buzz'
                        : 'Open game settings'
                    }
                    testID="game-settings-button"
                    style={[
                      styles.hudButton,
                      { borderColor },
                      settingsLockedForActiveBuzz && styles.hudButtonDisabled,
                    ]}>
                    <ThemedText
                      style={[
                        styles.hudButtonText,
                        { color: settingsLockedForActiveBuzz ? mutedColor : textColor },
                      ]}>
                      Settings
                    </ThemedText>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={handleLeave}
                  accessibilityRole="button"
                  accessibilityLabel="Leave game"
                  testID="game-leave-button"
                  style={[styles.hudButton, { borderColor }]}>
                  <ThemedText style={[styles.hudButtonText, { color: textColor }]}>Leave</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        }
        questionOnly
        question={currentQuestion}
        isLoading={isLoading}
        error={status === 'ended' ? 'Game ended' : undefined}
        result={currentResult}
        revealSpeed={settings?.revealSpeed}
        revealStartTime={revealStartTime}
        isPlaying={isPlaying}
        isBuzzLocked={isBuzzLocked}
        isSelfLockedOut={isSelfLockedOut}
        isCurrentPlayerBuzzer={currentBuzzer?.id === selfPlayer?.id}
        buzzQueuePosition={buzzQueuePosition}
        allowBuzzQueue
        canGoNext={isHost}
        buzzerName={currentBuzzer?.name}
        buzzTimerEnd={buzzTimerEnd}
        buzzerAnswer={buzzerAnswer}
        buzzerResult={buzzerResult}
        onBuzz={(wordIndex) => void buzzIn(wordIndex)}
        onSubmitAnswer={submitBuzzAnswer}
        onBuzzTyping={sendBuzzTyping}
        onWordIndexChange={syncRevealWordIndex}
        onNoBuzzTimeout={noBuzzTimeout}
        promptText={promptText}
        onNext={startNextQuestion}
        showMainActionLabel={false}
        hideMainActionWhenResult
        resultAccessory={reviewAccessory}
        bottomPadding={spacing.sm}
        overlay={
          showOverlay ? (
            otherPlayerChangingSettings || waitingForHostToStart ? (
              <View style={[styles.overlay, { backgroundColor: overlayBackground }]}>
                <ThemedText type="defaultSemiBold" style={[styles.overlayLabel, { color: overlayTextColor }]}>
                  {waitingForHostToStart ? 'Waiting for host...' : `${pausedByName} is changing game settings...`}
                </ThemedText>
              </View>
            ) : (
              <Pressable
                onPress={showPausedOverlay ? resumeGame : startNextQuestion}
                accessibilityRole="button"
                accessibilityLabel={showPausedOverlay ? 'Resume game' : 'Start next question'}
                testID="game-overlay-action"
                style={({ pressed }) => [
                  styles.overlay,
                  { backgroundColor: overlayBackground, opacity: pressed ? 0.9 : 1 },
                ]}>
                <ThemedText type="defaultSemiBold" style={[styles.overlayLabel, { color: overlayTextColor }]}>
                  {showPausedOverlay ? 'Game Paused — Tap to Resume' : 'Tap to Play'}
                </ThemedText>
              </Pressable>
            )
          ) : undefined
        }
      />
      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={handleCancelSettings}>
        <View style={styles.modalBackdrop}>
          <ThemedView style={[styles.modalCard, { borderColor, paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">Game Settings</ThemedText>
              <ThemedText style={[styles.modalSubtitle, { color: mutedColor }]}>
                Game is paused for everyone.
              </ThemedText>
              {gameCode ? (
                <Pressable
                  onPress={handleShareGameCode}
                  accessibilityRole="button"
                  accessibilityLabel={`Share game code ${gameCode}`}
                  testID="game-settings-code"
                  style={({ pressed }) => [
                    styles.settingsCodeCard,
                    { borderColor, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <View>
                    <ThemedText style={[styles.settingsCodeLabel, { color: mutedColor }]}>Game Code</ThemedText>
                    <ThemedText type="defaultSemiBold" style={styles.settingsCodeValue}>{gameCode}</ThemedText>
                  </View>
                  <ThemedText style={[styles.settingsCodeAction, { color: brandColor }]}>Share</ThemedText>
                </Pressable>
              ) : null}
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <ChipSelector
                kind="difficulty"
                options={availableDifficulties}
                selected={tempDifficulties}
                onToggle={toggleDifficulty}
                label="Difficulty"
              />
              <ChipSelector
                kind="category"
                options={availableCategories}
                selected={tempCategories}
                onToggle={toggleCategory}
                label="Categories"
              />

              {/* Speed */}
              <View style={styles.section}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Reveal Speed</ThemedText>
                <Slider
                  value={tempSpeed}
                  minimumValue={0}
                  maximumValue={1}
                  step={0.05}
                  onValueChange={setTempSpeed}
                  minimumTrackTintColor={brandColor}
                  maximumTrackTintColor={borderColor}
                  thumbTintColor={brandColor}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={handleCancelSettings}
                accessibilityRole="button"
                accessibilityLabel="Cancel settings"
                testID="game-settings-cancel"
                style={[styles.secondaryButton, { borderColor }]}>
                <ThemedText style={{ color: textColor }}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleApplySettings}
                accessibilityRole="button"
                accessibilityLabel="Apply settings and resume"
                testID="game-settings-apply"
                style={[styles.applyButton, { backgroundColor: brandColor }]}>
                <ThemedText style={styles.applyLabel}>Apply & Resume</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </Modal>

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
  gameContainer: {
    flex: 1,
  },
  gameHud: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(18),
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(10),
  },
  hudTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  hudStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  hudStat: {
    fontSize: responsiveFont(13),
  },
  hudDivider: {
    width: StyleSheet.hairlineWidth,
    height: verticalScale(16),
  },
  hudScore: {
    fontSize: responsiveFont(14),
  },
  hudActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  hudButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(999),
    paddingHorizontal: spacing.sm,
    paddingVertical: verticalScale(6),
  },
  hudButtonDisabled: {
    opacity: 0.45,
  },
  hudButtonText: {
    fontSize: responsiveFont(13),
    fontWeight: '600',
  },
  reviewPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(10),
  },
  reviewTextBlock: {
    flex: 1,
    gap: verticalScale(2),
  },
  reviewTitle: {
    fontSize: responsiveFont(15),
  },
  reviewSubtitle: {
    fontSize: responsiveFont(12),
  },
  reviewButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(999),
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(8),
    minWidth: scale(88),
    alignItems: 'center',
  },
  reviewButtonText: {
    fontSize: responsiveFont(13),
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  overlayLabel: {
    fontSize: responsiveFont(18),
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  // Modal styles
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
  settingsCodeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(14),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(10),
  },
  settingsCodeLabel: {
    fontSize: responsiveFont(12),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  settingsCodeValue: {
    fontSize: responsiveFont(18),
    letterSpacing: 3,
  },
  settingsCodeAction: {
    fontSize: responsiveFont(14),
    fontWeight: '700',
  },
  modalContent: {
    gap: spacing.lg,
    paddingBottom: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
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
