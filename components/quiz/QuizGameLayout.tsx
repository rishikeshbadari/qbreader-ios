import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnswerInput } from '@/components/quiz/AnswerInput';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { AnswerResult, Tossup } from '@/types/qb';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

type Props = {
  // Header
  title: string;
  subtitle: React.ReactNode;
  headerRight?: React.ReactNode;

  // Question state
  question: Tossup | null | undefined;
  isLoading: boolean;
  error?: string;
  result: AnswerResult | null | undefined;
  revealSpeed?: number;

  // Game state
  isPlaying: boolean;
  isBuzzLocked?: boolean;
  buzzerName?: string; // Name of player who is currently buzzing (multiplayer)

  // Callbacks
  onBuzz: () => void;
  onSubmitAnswer: (answer: string, wordIndex?: number) => Promise<void> | void;
  onNext: () => void;
  onRetry?: () => void;

  // Optional overlay
  overlay?: React.ReactNode;

  // Bottom padding (for tab bar)
  bottomPadding?: number;

  // Set to true if parent component handles bottom safe area (e.g., wrapped in SafeAreaView)
  parentHandlesBottomSafeArea?: boolean;

  // Buzz timer (multiplayer) — epoch ms when timer expires
  buzzTimerEnd?: number | null;
};

export function QuizGameLayout({
  title,
  subtitle,
  headerRight,
  question,
  isLoading,
  error,
  result,
  revealSpeed,
  isPlaying,
  isBuzzLocked = false,
  buzzerName,
  onBuzz,
  onSubmitAnswer,
  onNext,
  onRetry,
  overlay,
  bottomPadding = 0,
  parentHandlesBottomSafeArea = false,
  buzzTimerEnd,
}: Props) {
  const [answer, setAnswer] = useState('');
  const [hasBuzzed, setHasBuzzed] = useState(false);
  const keyboardAnimatedValue = useRef(new Animated.Value(0)).current;
  const wordIndexRef = useRef(0);

  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const dangerColor = useThemeColor({}, 'error');
  const brandColor = useThemeColor({}, 'brand');

  // Refs for keyboard handler
  const stateRef = useRef({ isPlaying, hasBuzzed, result, answer });
  stateRef.current = { isPlaying, hasBuzzed, result, answer };
  const submittedRef = useRef(false);

  // Buzz timer countdown
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!buzzTimerEnd) {
      setTimerSeconds(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((buzzTimerEnd - Date.now()) / 1000));
      setTimerSeconds(remaining);
      if (remaining <= 0) {
        setTimerSeconds(null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [buzzTimerEnd]);

  // Track keyboard height
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      // If parent handles bottom safe area, subtract it from keyboard height
      // since the overlay's bottom is already inset by the safe area
      const adjustedHeight = parentHandlesBottomSafeArea
        ? Math.max(0, e.endCoordinates.height - insets.bottom)
        : e.endCoordinates.height;
      keyboardAnimatedValue.setValue(adjustedHeight);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardAnimatedValue.setValue(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [onSubmitAnswer, keyboardAnimatedValue, parentHandlesBottomSafeArea, insets.bottom]);

  // Reset on new question
  useEffect(() => {
    setAnswer('');
    setHasBuzzed(false);
    submittedRef.current = false;
    wordIndexRef.current = 0;
  }, [question?.id]);

  // Reset submitted flag when buzz state changes
  useEffect(() => {
    if (!hasBuzzed) submittedRef.current = false;
  }, [hasBuzzed]);

  // Derived state - hasBuzzed means THIS user buzzed, so show answer input regardless of isBuzzLocked
  const isAnswering = hasBuzzed && isPlaying && !result;
  const showResult = Boolean(result);
  const showNextButton = showResult;

  // Handlers
  const handleWordIndexChange = (index: number) => {
    wordIndexRef.current = index;
  };

  const handleBuzz = () => {
    if (!question || isLoading || hasBuzzed || !isPlaying || isBuzzLocked) return;
    setHasBuzzed(true);
    onBuzz();
  };

  const handleSubmit = async () => {
    if (!isPlaying || !hasBuzzed || result) return;
    submittedRef.current = true;
    await onSubmitAnswer(answer.trim(), wordIndexRef.current);
    setAnswer('');
    setHasBuzzed(false);
  };

  const handleMainAction = () => {
    Keyboard.dismiss();
    if (showNextButton) {
      // Go to next question
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setAnswer('');
      setHasBuzzed(false);
      onNext();
    } else {
      // Buzz
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      handleBuzz();
    }
  };

  const contentPaddingBottom = spacing.lg + bottomPadding + insets.bottom;

  return (
    <View style={styles.root}>
      <ThemedView style={styles.container}>
        <View style={[styles.content, { paddingBottom: contentPaddingBottom }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText type="title">{title}</ThemedText>
              {typeof subtitle === 'string' ? (
                <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
              ) : subtitle}
            </View>
            {headerRight}
          </View>

          {/* Question Card */}
          <View style={styles.questionWrapper}>
            <QuestionCard
              tossup={question ?? undefined}
              isLoading={isLoading}
              error={error}
              showAnswer={showResult}
              isBuzzed={hasBuzzed || isBuzzLocked}
              result={result ?? undefined}
              revealActive={isPlaying && !isBuzzLocked}
              revealSpeedOverride={revealSpeed}
              showRevealButton={false}
              onWordIndexChange={handleWordIndexChange}
            />
            {overlay}
            {/* Show buzzer name when someone else is buzzing */}
            {buzzerName && isBuzzLocked && !hasBuzzed && !showResult && (
              <View style={[styles.buzzerOverlay, { backgroundColor: colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)' }]}>
                <ThemedText type="defaultSemiBold" style={styles.buzzerText}>
                  {buzzerName} buzzed in...
                </ThemedText>
                {timerSeconds != null && timerSeconds > 0 && (
                  <ThemedText style={[styles.timerText, { color: timerSeconds <= 3 ? dangerColor : brandColor }]}>
                    {timerSeconds}s remaining
                  </ThemedText>
                )}
              </View>
            )}
          </View>

          {/* Action button - Buzz or Next */}
          <Pressable
            onPress={handleMainAction}
            disabled={!question || isLoading || !isPlaying || (hasBuzzed && !showResult) || (!showNextButton && isBuzzLocked)}
            style={({ pressed }) => [
              styles.mainButton,
              {
                backgroundColor: showNextButton ? brandColor : dangerColor,
                opacity: !question || isLoading ? 0.25 : (hasBuzzed && !showResult) || (!showNextButton && isBuzzLocked) ? 0.6 : pressed ? 0.9 : 1,
              },
            ]}>
            <ThemedText type="defaultSemiBold" style={styles.actionLabel}>
              {showNextButton ? 'Next' : 'Buzz'}
            </ThemedText>
          </Pressable>

          {/* Extra info */}
          {result?.directedPrompt && (
            <ThemedText style={styles.prompt}>Directed prompt: {result.directedPrompt}</ThemedText>
          )}
          {error && onRetry && (
            <Pressable onPress={onRetry}>
              <ThemedText style={[styles.error, { color: dangerColor }]}>{error} Tap to try again.</ThemedText>
            </Pressable>
          )}
        </View>
      </ThemedView>

      {/* Answer overlay */}
      {isAnswering && (
        <View
          style={[
            styles.answerOverlay,
            { backgroundColor: colorScheme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)' },
          ]}>
          <Pressable style={styles.answerOverlayTouchable} onPress={Keyboard.dismiss} />
          <Animated.View style={[styles.answerInputContainer, { marginBottom: keyboardAnimatedValue }]}>
            {/* Timer display */}
            {timerSeconds != null && timerSeconds > 0 && (
              <View style={styles.timerContainer}>
                <ThemedText type="defaultSemiBold" style={[
                  styles.timerCountdown,
                  { color: timerSeconds <= 3 ? dangerColor : brandColor },
                ]}>
                  {timerSeconds}s
                </ThemedText>
              </View>
            )}
            <AnswerInput
              value={answer}
              onChangeText={setAnswer}
              onSubmit={handleSubmit}
              disabled={!question || isLoading}
              autoFocus
            />
            <View style={styles.submitRow}>
              <Pressable
                onPress={handleSubmit}
                accessibilityRole="button"
                accessibilityLabel="Submit answer"
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: brandColor, opacity: pressed ? 0.8 : 1 },
                ]}>
                <ThemedText type="defaultSemiBold" style={styles.submitLabel}>Submit</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  subtitle: {
    opacity: 0.8,
  },
  questionWrapper: {
    flex: 1,
    position: 'relative',
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  mainButton: {
    borderRadius: scale(14),
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  actionLabel: {
    color: '#fff',
    letterSpacing: 0.6,
    fontSize: responsiveFont(16),
  },
  prompt: {
    fontStyle: 'italic',
  },
  error: {
    fontWeight: '600',
  },
  answerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  answerOverlayTouchable: {
    flex: 1,
  },
  answerInputContainer: {
    width: '100%',
  },
  timerContainer: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  timerCountdown: {
    fontSize: responsiveFont(24),
    letterSpacing: 1,
  },
  submitRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  submitButton: {
    borderRadius: scale(12),
    paddingVertical: verticalScale(12),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  submitLabel: {
    color: '#fff',
    fontSize: responsiveFont(16),
    letterSpacing: 0.4,
  },
  buzzerOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  buzzerText: {
    fontSize: responsiveFont(18),
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  timerText: {
    fontSize: responsiveFont(16),
  },
});
