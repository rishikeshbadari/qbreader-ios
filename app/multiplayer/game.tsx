import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';

import { ChipSelector } from '@/components/quiz/ChipSelector';
import { QuizGameLayout } from '@/components/quiz/QuizGameLayout';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useSettings } from '@/hooks/useSettings';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export default function MultiplayerGameScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const {
    sessionId,
    status,
    players,
    settings,
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
    startNextQuestion,
    submitAnswer,
    pauseGame,
    updateSettings,
    leaveGame,
  } = useMultiplayer();

  // Auto-navigate to summary when game ends (e.g., when another player leaves)
  useEffect(() => {
    if (status === 'ended') {
      router.replace('/multiplayer/summary');
    }
  }, [status, router]);

  const { availableCategories, availableDifficulties, revealSpeed } = useSettings();
  const [showSettings, setShowSettings] = useState(false);

  // Temp settings state for modal
  const [tempCategories, setTempCategories] = useState<string[]>([]);
  const [tempDifficulties, setTempDifficulties] = useState<number[]>([]);
  const [tempSpeed, setTempSpeed] = useState(0.5);

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const successColor = useThemeColor({}, 'success');
  const errorColor = useThemeColor({}, 'error');

  const isPlaying = status === 'playing';
  const selfScore = selfPlayer ? (scores[selfPlayer.id] ?? 0) : 0;

  const handleOpenSettings = async () => {
    await pauseGame();
    setTempCategories(settings?.categories ?? availableCategories.map(c => c.name));
    setTempDifficulties(settings?.difficulties ?? availableDifficulties.flatMap(d => d.values));
    setTempSpeed(settings?.revealSpeed ?? revealSpeed);
    setShowSettings(true);
  };

  const handleApplySettings = async () => {
    await updateSettings({
      categories: tempCategories.length ? tempCategories : availableCategories.map(c => c.name),
      difficulties: tempDifficulties.length ? tempDifficulties : availableDifficulties.flatMap(d => d.values),
      revealSpeed: tempSpeed,
    });
    setShowSettings(false);
    await startNextQuestion();
  };

  const handleLeave = async () => {
    await leaveGame();
    router.replace('/multiplayer/summary');
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

  const showPausedOverlay = status === 'paused' && !showSettings;
  const showOverlay = (!isPlaying && status !== 'ended' && !currentQuestion) || showPausedOverlay;

  return (
    <ThemedView style={[styles.gameContainer, { paddingTop: insets.top }]}>
      <QuizGameLayout
        title="Multiplayer"
        subtitle={
          <View style={styles.subtitleRow}>
            <ThemedText style={[styles.subtitleText, { color: mutedColor }]}>
              {players.length} player{players.length !== 1 ? 's' : ''}
            </ThemedText>
            <ThemedText style={[styles.subtitleDot, { color: mutedColor }]}>·</ThemedText>
            <ThemedText style={[styles.subtitleText, { color: selfScore >= 0 ? successColor : errorColor }]}>
              {selfScore} pts
            </ThemedText>
          </View>
        }
        headerRight={
          <View style={styles.headerButtons}>
            {isHost ? (
              <Pressable onPress={handleOpenSettings} style={[styles.headerButton, { borderColor }]}>
                <ThemedText style={{ color: textColor, fontSize: responsiveFont(14) }}>Settings</ThemedText>
              </Pressable>
            ) : null}
            <Pressable onPress={handleLeave} style={[styles.headerButton, { borderColor }]}>
              <ThemedText style={{ color: textColor, fontSize: responsiveFont(14) }}>Leave</ThemedText>
            </Pressable>
          </View>
        }
        question={currentQuestion}
        isLoading={isLoading}
        error={status === 'ended' ? 'Game ended' : undefined}
        result={currentResult}
        revealSpeed={settings?.revealSpeed}
        isPlaying={isPlaying}
        isBuzzLocked={isBuzzLocked || isSelfLockedOut}
        buzzerName={currentBuzzer?.name}
        buzzTimerEnd={buzzTimerEnd}
        onBuzz={() => {}}
        onSubmitAnswer={submitAnswer}
        onNext={startNextQuestion}
        overlay={
          showOverlay ? (
            showPausedOverlay ? (
              <View style={[styles.overlay, { backgroundColor: overlayBackground }]}>
                <ThemedText type="defaultSemiBold" style={[styles.overlayLabel, { color: overlayTextColor }]}>
                  Settings updating…
                </ThemedText>
              </View>
            ) : (
              <Pressable
                onPress={startNextQuestion}
                style={({ pressed }) => [
                  styles.overlay,
                  { backgroundColor: overlayBackground, opacity: pressed ? 0.9 : 1 },
                ]}>
                <ThemedText type="defaultSemiBold" style={[styles.overlayLabel, { color: overlayTextColor }]}>
                  {status === 'lobby' ? 'Tap to Start' : 'Tap to Play'}
                </ThemedText>
              </Pressable>
            )
          ) : undefined
        }
      />

      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalBackdrop}>
          <ThemedView style={[styles.modalCard, { borderColor }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle">Game Settings</ThemedText>
              <ThemedText style={[styles.modalSubtitle, { color: mutedColor }]}>
                Game is paused for everyone.
              </ThemedText>
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
                onPress={() => setShowSettings(false)}
                style={[styles.secondaryButton, { borderColor }]}>
                <ThemedText style={{ color: textColor }}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleApplySettings}
                style={[styles.applyButton, { backgroundColor: brandColor }]}>
                <ThemedText style={styles.applyLabel}>Apply & Resume</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  gameContainer: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  headerButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(8),
    paddingHorizontal: spacing.sm,
    paddingVertical: verticalScale(6),
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  subtitleText: {
    fontSize: responsiveFont(14),
  },
  subtitleDot: {
    fontSize: responsiveFont(14),
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
