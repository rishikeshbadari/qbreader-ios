import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';

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

  const {
    sessionId,
    status,
    settings,
    currentQuestion,
    currentResult,
    isLoading,
    isBuzzLocked,
    startNextQuestion,
    submitAnswer,
    pauseGame,
    updateSettings,
    endGame,
  } = useMultiplayer();

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

  const isPlaying = status === 'playing';

  const handleOpenSettings = async () => {
    await pauseGame();
    setTempCategories(settings?.categories ?? availableCategories.map(c => c.name));
    setTempDifficulties(settings?.difficulties ?? availableDifficulties.flatMap(d => d.values));
    setTempSpeed(settings?.revealSpeed ?? revealSpeed);
    setShowSettings(true);
  };

  const handleApplySettings = async () => {
    updateSettings({
      categories: tempCategories.length ? tempCategories : availableCategories.map(c => c.name),
      difficulties: tempDifficulties.length ? tempDifficulties : availableDifficulties.flatMap(d => d.values),
      revealSpeed: tempSpeed,
    });
    setShowSettings(false);
    await startNextQuestion();
  };

  const handleEndGame = async () => {
    await endGame();
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

  const showOverlay = !isPlaying && status !== 'ended' && !currentQuestion;

  return (
    <SafeAreaView style={styles.safeArea}>
      <QuizGameLayout
        title="Multiplayer"
        subtitle={sessionId ? `Game code: ${sessionId}` : 'Local multiplayer game'}
        headerRight={
          <View style={styles.headerButtons}>
            <Pressable onPress={handleOpenSettings} style={[styles.headerButton, { borderColor }]}>
              <ThemedText style={{ color: textColor, fontSize: responsiveFont(14) }}>Settings</ThemedText>
            </Pressable>
            <Pressable onPress={handleEndGame} style={[styles.headerButton, { borderColor }]}>
              <ThemedText style={{ color: textColor, fontSize: responsiveFont(14) }}>End</ThemedText>
            </Pressable>
          </View>
        }
        question={currentQuestion}
        isLoading={isLoading}
        error={status === 'ended' ? 'Game ended' : undefined}
        result={currentResult}
        revealSpeed={settings?.revealSpeed}
        isPlaying={isPlaying}
        isBuzzLocked={isBuzzLocked}
        onBuzz={() => {}}
        onSubmitAnswer={submitAnswer}
        onNext={startNextQuestion}
        overlay={
          showOverlay ? (
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
              {/* Difficulties */}
              <View style={styles.section}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Difficulty</ThemedText>
                <View style={styles.chipGrid}>
                  {availableDifficulties.map(option => {
                    const isSelected = option.values.every(v => tempDifficulties.includes(v));
                    return (
                      <Pressable
                        key={option.label}
                        onPress={() => toggleDifficulty(option.values)}
                        style={[styles.chip, { borderColor, backgroundColor: isSelected ? brandColor : 'transparent' }]}>
                        <ThemedText style={[styles.chipLabel, { color: isSelected ? '#fff' : textColor }]}>
                          {option.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Categories */}
              <View style={styles.section}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Categories</ThemedText>
                <View style={styles.chipGrid}>
                  {availableCategories.map(category => {
                    const isSelected = tempCategories.includes(category.name);
                    return (
                      <Pressable
                        key={category.name}
                        onPress={() => toggleCategory(category.name)}
                        style={[styles.chip, { borderColor, backgroundColor: isSelected ? brandColor : 'transparent' }]}>
                        <ThemedText style={[styles.chipLabel, { color: isSelected ? '#fff' : textColor }]}>
                          {category.name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
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
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(8),
    paddingHorizontal: spacing.sm,
    paddingVertical: verticalScale(6),
  },
  chipLabel: {
    fontSize: responsiveFont(13),
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
