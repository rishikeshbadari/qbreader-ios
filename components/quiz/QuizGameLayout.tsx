import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
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
  subtitle: string;
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
  onSubmitAnswer: (answer: string) => Promise<void> | void;
  onNext: () => void;
  onRetry?: () => void;

  // Optional overlay
  overlay?: React.ReactNode;

  // Bottom padding (for tab bar)
  bottomPadding?: number;
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
}: Props) {
  const [answer, setAnswer] = useState('');
  const [hasBuzzed, setHasBuzzed] = useState(false);
  const keyboardAnimatedValue = useRef(new Animated.Value(0)).current;

  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const dangerColor = useThemeColor({}, 'error');
  const brandColor = useThemeColor({}, 'brand');

  // Refs for keyboard handler
  const stateRef = useRef({ isPlaying, hasBuzzed, result, answer });
  stateRef.current = { isPlaying, hasBuzzed, result, answer };
  const submittedRef = useRef(false);

  // Track keyboard height
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      keyboardAnimatedValue.setValue(e.endCoordinates.height);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      // Auto-submit empty answer when keyboard hides
      const { isPlaying, hasBuzzed, result, answer } = stateRef.current;
      if (isPlaying && hasBuzzed && !result && !submittedRef.current && answer.trim().length === 0) {
        submittedRef.current = true;
        void onSubmitAnswer('');
      }
      
      keyboardAnimatedValue.setValue(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [onSubmitAnswer, keyboardAnimatedValue]);

  // Reset on new question
  useEffect(() => {
    setAnswer('');
    setHasBuzzed(false);
    submittedRef.current = false;
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
  const handleBuzz = () => {
    if (!question || isLoading || hasBuzzed || !isPlaying || isBuzzLocked) return;
    setHasBuzzed(true);
    onBuzz();
  };

  const handleSubmit = async () => {
    if (!isPlaying || !hasBuzzed || result) return;
    submittedRef.current = true;
    await onSubmitAnswer(answer.trim());
    setAnswer('');
    setHasBuzzed(false);
  };

  const handleMainAction = () => {
    Keyboard.dismiss();
    if (showNextButton) {
      // Go to next question
      setAnswer('');
      setHasBuzzed(false);
      onNext();
    } else {
      // Buzz
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
              <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
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
            />
            {overlay}
            {/* Show buzzer name when someone else is buzzing */}
            {buzzerName && isBuzzLocked && !hasBuzzed && !showResult && (
              <View style={[styles.buzzerOverlay, { backgroundColor: colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)' }]}>
                <ThemedText type="defaultSemiBold" style={styles.buzzerText}>
                  {buzzerName} buzzed in...
                </ThemedText>
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
              <ThemedText style={styles.error}>{error} Tap to try again.</ThemedText>
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
            <AnswerInput
              value={answer}
              onChangeText={setAnswer}
              onSubmit={handleSubmit}
              disabled={!question || isLoading}
              autoFocus
            />
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
    color: '#E45858',
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
  buzzerOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  buzzerText: {
    fontSize: responsiveFont(18),
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});

