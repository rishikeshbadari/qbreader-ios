import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  Modal,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { AnswerInput } from '@/components/quiz/AnswerInput';
import { useSettings } from '@/hooks/useSettings';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export default function MultiplayerGameScreen() {
  const { sessionId: routeSessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const {
    status,
    sessionId,
    settings,
    currentQuestion,
    currentResult,
    loadingQuestion,
    buzzLocked,
    lockForBuzz,
    pauseSession,
    updateSettings,
    startNextQuestion,
    submitBuzz,
  } = useMultiplayer();
  const [answer, setAnswer] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { availableCategories, availableDifficulties, revealSpeed } = useSettings();
  const [tempCategories, setTempCategories] = useState<string[]>(settings?.categories ?? []);
  const [tempDifficulties, setTempDifficulties] = useState<number[]>(settings?.difficulties ?? []);
  const [tempSpeed, setTempSpeed] = useState<number>(settings?.revealSpeed ?? revealSpeed);
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const { height } = useWindowDimensions();
  const questionMaxHeight = Math.min(height * 0.55, 460);
  const questionMinHeight = 260;
  const insets = useSafeAreaInsets();
  const keyboardAvoidingOffset = insets.top + 12;
  const answerInputBottomSpacing =
    keyboardHeight > 0 ? Math.max(insets.bottom, 4) : Math.max(insets.bottom, 10);
  useEffect(() => {
    const handleShow = (e: any) => {
      setKeyboardHeight(e?.endCoordinates?.height ?? 0);
    };
    const handleHide = () => setKeyboardHeight(0);
    const showSub = Keyboard.addListener('keyboardWillShow', handleShow);
    const hideSub = Keyboard.addListener('keyboardWillHide', handleHide);
    const showSubDid = Keyboard.addListener('keyboardDidShow', handleShow);
    const hideSubDid = Keyboard.addListener('keyboardDidHide', handleHide);
    return () => {
      showSub.remove();
      hideSub.remove();
      showSubDid.remove();
      hideSubDid.remove();
    };
  }, []);

  const showSessionId = sessionId ?? (Array.isArray(routeSessionId) ? routeSessionId[0] : routeSessionId);

  const allDifficulties = useMemo(
    () => availableDifficulties.flatMap((d) => d.values),
    [availableDifficulties]
  );

  const allCategories = useMemo(
    () => availableCategories.map((c) => c.name),
    [availableCategories]
  );

  const handleNext = async () => {
    await startNextQuestion();
    setAnswer('');
    setShowInput(false);
  };

  const handlePrimary = async () => {
    const canStartNext = status !== 'in_progress' || Boolean(currentResult) || !currentQuestion;
    if (canStartNext) {
      await handleNext();
      return;
    }

    if (!showInput) {
      setShowInput(true);
      await lockForBuzz();
      return;
    }

    if (!answer.trim() || status !== 'in_progress' || currentResult) {
      return;
    }
    await submitBuzz(answer.trim());
    setAnswer('');
    setShowInput(false);
  };

  const handleOpenSettings = async () => {
    await pauseSession();
    setTempCategories(settings?.categories ?? allCategories);
    setTempDifficulties(settings?.difficulties ?? allDifficulties);
    setTempSpeed(settings?.revealSpeed ?? revealSpeed);
    setShowSettings(true);
  };

  const handleApplySettings = async () => {
    const nextSettings = {
      difficulties: tempDifficulties.length ? tempDifficulties : allDifficulties,
      categories: tempCategories.length ? tempCategories : allCategories,
      revealSpeed: tempSpeed,
    };
    updateSettings(nextSettings);
    setShowSettings(false);
    await startNextQuestion();
  };

  const toggleDifficulty = (values: number[]) => {
    const isSelected = values.every((v) => tempDifficulties.includes(v));
    if (isSelected) {
      const next = tempDifficulties.filter((v) => !values.includes(v));
      setTempDifficulties(next.length > 0 ? next : values);
    } else {
      setTempDifficulties(Array.from(new Set([...tempDifficulties, ...values])));
    }
  };

  const toggleCategory = (name: string) => {
    const isSelected = tempCategories.includes(name);
    if (isSelected) {
      const next = tempCategories.filter((c) => c !== name);
      setTempCategories(next.length > 0 ? next : [name]);
    } else {
      setTempCategories([...tempCategories, name].sort((a, b) => a.localeCompare(b)));
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardAvoidingOffset}>
      <ThemedView style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.metaBlock}>
          <ThemedText type="title">Multiplayer</ThemedText>
          <View style={styles.badgeRow}>
            {showSessionId ? (
              <View style={[styles.badge, { borderColor: brandColor }]}>
                <ThemedText type="defaultSemiBold" style={[styles.badgeText, { color: brandColor }]}>
                  Code: {showSessionId}
                </ThemedText>
              </View>
            ) : null}
            <View style={[styles.badge, { borderColor: borderColor }]}>
              <ThemedText style={styles.badgeText}>Status: {status}</ThemedText>
            </View>
          </View>
        </View>
        <Pressable
          onPress={handleOpenSettings}
          style={({ pressed }) => [
            styles.settingsButton,
            { borderColor, opacity: pressed ? 0.8 : 1 },
          ]}>
          <ThemedText type="defaultSemiBold">Settings</ThemedText>
        </Pressable>
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.questionShell,
            { borderColor, minHeight: questionMinHeight, maxHeight: questionMaxHeight },
          ]}>
          <View style={styles.questionCardWrapper}>
            <QuestionCard
              tossup={currentQuestion}
              isLoading={loadingQuestion}
            error={status === 'ended' ? 'Game ended' : undefined}
            showAnswer={Boolean(currentResult)}
            isBuzzed={buzzLocked || Boolean(currentResult)}
            result={currentResult}
            revealActive={!buzzLocked && status === 'in_progress'}
            onFullQuestionRevealChange={() => {}}
            revealSpeedOverride={settings?.revealSpeed}
            showRevealButton={false}
            showMeta={false}
          />
        </View>
        </View>
        <View style={[styles.controlCard, { borderColor }]}>
          <Pressable
            onPress={handlePrimary}
            disabled={loadingQuestion}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: brandColor,
                opacity: loadingQuestion ? 0.4 : pressed ? 0.85 : 1,
              },
            ]}>
            <ThemedText type="defaultSemiBold" style={styles.primaryLabel}>
              {status !== 'in_progress' || currentResult || !currentQuestion
                ? loadingQuestion
                  ? 'Loading…'
                  : 'Next question'
                : showInput
                  ? 'Submit'
                  : 'Buzz'}
            </ThemedText>
          </Pressable>
        </View>
      </View>
      {showInput && status === 'in_progress' && !currentResult ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <BlurView intensity={35} tint="light" style={StyleSheet.absoluteFill}>
            <View
              pointerEvents="box-none"
              style={[
                styles.inputOverlay,
                {
                  paddingTop: insets.top + 12,
                  paddingBottom: (keyboardHeight || 0) + answerInputBottomSpacing,
                },
              ]}>
              <View
                style={[
                  styles.inputCard,
                  {
                    borderColor: brandColor,
                    shadowColor: brandColor,
                    backgroundColor: '#f8fafc',
                  },
                ]}>
                <ThemedText type="defaultSemiBold" style={styles.inputLabel}>
                  Your answer
                </ThemedText>
                <AnswerInput
                  value={answer}
                  onChangeText={setAnswer}
                  onSubmit={handlePrimary}
                  disabled={Boolean(currentResult) || status !== 'in_progress'}
                  autoFocus
                />
              </View>
            </View>
          </BlurView>
        </View>
      ) : null}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalBackdrop}>
          <ThemedView style={[styles.modalCard, { borderColor }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="defaultSemiBold">Adjust settings</ThemedText>
              <ThemedText style={styles.muted}>Game is paused for everyone.</ThemedText>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Difficulties</ThemedText>
                </View>
                <View style={styles.chipGrid}>
                  {availableDifficulties.map((option) => {
                    const isSelected = option.values.every((v) => tempDifficulties.includes(v));
                    return (
                      <Pressable
                        key={option.label}
                        onPress={() => toggleDifficulty(option.values)}
                        style={[
                          styles.chip,
                          {
                            borderColor,
                            backgroundColor: isSelected ? brandColor : 'transparent',
                          },
                        ]}>
                        <ThemedText
                          type="defaultSemiBold"
                          style={[styles.chipLabel, { color: isSelected ? '#fff' : '#0f172a' }]}>
                          {option.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Categories</ThemedText>
                </View>
                <View style={styles.chipGrid}>
                  {availableCategories.map((category) => {
                    const isSelected = tempCategories.includes(category.name);
                    return (
                      <Pressable
                        key={category.name}
                        onPress={() => toggleCategory(category.name)}
                        style={[
                          styles.chip,
                          {
                            borderColor,
                            backgroundColor: isSelected ? brandColor : 'transparent',
                          },
                        ]}>
                        <ThemedText
                          type="defaultSemiBold"
                          style={[styles.chipLabel, { color: isSelected ? '#fff' : '#0f172a' }]}>
                          {category.name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.section}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Question reveal speed</ThemedText>
                <View style={styles.sliderRow}>
                  <Slider
                    value={tempSpeed}
                    minimumValue={0}
                    maximumValue={1}
                    step={0.05}
                    onValueChange={setTempSpeed}
                    minimumTrackTintColor={brandColor}
                    maximumTrackTintColor={borderColor}
                    thumbTintColor={brandColor}
                    style={styles.slider}
                  />
                  <View style={styles.speedLegends}>
                    <ThemedText style={[styles.speedLegend, styles.legendText]}>Very slow</ThemedText>
                    <ThemedText style={[styles.speedLegend, styles.legendText]}>Instant</ThemedText>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowSettings(false)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    borderColor,
                    backgroundColor: '#E2E8F0',
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <ThemedText type="defaultSemiBold" style={styles.secondaryLabel}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleApplySettings}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: brandColor, opacity: pressed ? 0.9 : 1, marginTop: 0 },
                ]}>
                <ThemedText type="defaultSemiBold" style={styles.primaryLabel}>
                  Apply & resume
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </Modal>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  metaBlock: {
    flex: 1,
    gap: spacing.xs + scale(2),
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.md - scale(2),
    paddingVertical: verticalScale(6),
    borderRadius: 999,
    borderWidth: scale(1),
  },
  badgeText: {
    fontSize: responsiveFont(12),
    letterSpacing: 0.4,
  },
  settingsButton: {
    borderWidth: scale(1),
    borderRadius: scale(12),
    paddingHorizontal: spacing.md + scale(2),
    paddingVertical: verticalScale(10),
    minHeight: MIN_TOUCH_TARGET,
  },
  section: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  muted: {
    opacity: 0.6,
  },
  body: {
    flex: 1,
    gap: spacing.md,
  },
  questionShell: {
    flex: 1,
    borderWidth: scale(1),
    borderRadius: scale(16),
    padding: spacing.md,
    overflow: 'hidden',
  },
  questionCardWrapper: {
    flex: 1,
  },
  controlCard: {
    borderWidth: scale(1),
    borderRadius: scale(16),
    padding: spacing.md + scale(2),
    gap: spacing.md,
  },
  helper: {
    opacity: 0.7,
  },
  primaryButton: {
    marginTop: spacing.xs,
    borderRadius: scale(12),
    paddingVertical: verticalScale(14),
    paddingHorizontal: spacing.lg + scale(2),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
    minHeight: MIN_TOUCH_TARGET,
  },
  primaryLabel: {
    color: '#fff',
    letterSpacing: 0.4,
  },
  inputOverlay: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.xs + scale(2),
  },
  inputCard: {
    borderWidth: scale(1),
    borderRadius: scale(18),
    backgroundColor: '#fff',
    padding: spacing.lg,
    shadowOpacity: 0.2,
    shadowRadius: scale(16),
    shadowOffset: { width: 0, height: scale(-2) },
    elevation: 10,
    width: '100%',
  },
  inputLabel: {
    marginBottom: spacing.sm,
    color: '#0f172a',
    opacity: 0.85,
    letterSpacing: 0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderWidth: scale(1),
    borderTopLeftRadius: scale(18),
    borderTopRightRadius: scale(18),
    padding: spacing.lg + scale(2),
    maxHeight: '85%',
    backgroundColor: 'white',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: scale(-2) },
  },
  modalHeader: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  modalContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: scale(6),
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm + scale(2),
    marginTop: spacing.sm + scale(2),
  },
  secondaryButton: {
    borderWidth: scale(1),
    borderRadius: scale(10),
    paddingHorizontal: spacing.lg,
    paddingVertical: verticalScale(12),
    minWidth: scale(110),
    minHeight: MIN_TOUCH_TARGET,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: scale(1),
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
  },
  chipLabel: {
    letterSpacing: 0.3,
  },
  link: {
    color: '#0f172a',
    opacity: 0.8,
  },
  secondaryLabel: {
    color: '#0f172a',
    letterSpacing: 0.2,
  },
  sectionTitle: {
    letterSpacing: 0.2,
    fontSize: responsiveFont(15),
    color: '#0f172a',
  },
  sliderRow: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    paddingHorizontal: scale(4),
  },
  slider: {
    width: '100%',
  },
  speedLegends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  speedLegend: {
    fontSize: responsiveFont(12),
  },
  legendText: {
    color: '#0f172a',
    opacity: 0.8,
  },
});
