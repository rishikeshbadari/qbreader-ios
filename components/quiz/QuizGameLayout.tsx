import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type KeyboardEvent,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnswerInput } from '@/components/quiz/AnswerInput';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { AnswerResult, Tossup } from '@/types/qb';
import { SCORING } from '@/types/multiplayer';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

type Props = {
  // Header
  title: string;
  subtitle: React.ReactNode;
  headerRight?: React.ReactNode;
  showHeader?: boolean;

  // Question state
  question: Tossup | null | undefined;
  isLoading: boolean;
  error?: string;
  result: AnswerResult | null | undefined;
  submittedAnswer?: string;
  revealSpeed?: number;

  // Game state
  isPlaying: boolean;
  isBuzzLocked?: boolean;
  isSelfLockedOut?: boolean; // Player answered wrong — can't buzz but can still watch
  isCurrentPlayerBuzzer?: boolean;
  buzzQueuePosition?: number | null;
  allowBuzzQueue?: boolean;
  canGoNext?: boolean;
  buzzerName?: string; // Name of player who is currently buzzing (multiplayer)

  // Multiplayer buzz state
  buzzerAnswer?: string;
  buzzerResult?: { answer: string; isCorrect: boolean } | null;

  // Callbacks
  onBuzz: (wordIndex?: number) => void;
  onSubmitAnswer: (answer: string) => Promise<void> | void;
  onNext: () => void;
  onRetry?: () => void;
  onBuzzTyping?: (text: string) => void;
  onWordIndexChange?: (wordIndex: number) => void;

  // Optional overlay
  overlay?: React.ReactNode;
  topAccessory?: React.ReactNode;
  questionOnly?: boolean;
  showMainActionLabel?: boolean;
  showSupplementalText?: boolean;
  hideMainActionWhenResult?: boolean;
  resultAccessory?: ReactNode;

  // Bottom padding (for tab bar)
  bottomPadding?: number;

  // Set to true if parent component handles bottom safe area (e.g., wrapped in SafeAreaView)
  parentHandlesBottomSafeArea?: boolean;

  // Buzz timer (multiplayer) — epoch ms when timer expires
  buzzTimerEnd?: number | null;

  // Called when the full question is revealed and no one buzzes within the timer
  onNoBuzzTimeout?: (questionId?: string) => void;

  // Synchronized reveal start time (epoch ms) — lets late-receiving devices skip ahead
  revealStartTime?: number | null;

  // Prompt text (e.g. "Be more specific") — reopens buzz input for another attempt
  promptText?: string | null;
};

export function QuizGameLayout({
  title,
  subtitle,
  headerRight,
  showHeader = true,
  question,
  isLoading,
  error,
  result,
  submittedAnswer,
  revealSpeed,
  isPlaying,
  isBuzzLocked = false,
  isSelfLockedOut = false,
  isCurrentPlayerBuzzer,
  buzzQueuePosition,
  allowBuzzQueue = false,
  canGoNext = true,
  buzzerName,
  buzzerAnswer: remoteBuzzerAnswer,
  buzzerResult,
  onBuzz,
  onSubmitAnswer,
  onNext,
  onRetry,
  onBuzzTyping,
  onWordIndexChange,
  overlay,
  topAccessory,
  questionOnly = false,
  showMainActionLabel = true,
  showSupplementalText = true,
  hideMainActionWhenResult = false,
  resultAccessory,
  bottomPadding = 0,
  parentHandlesBottomSafeArea = false,
  buzzTimerEnd,
  revealStartTime,
  onNoBuzzTimeout,
  promptText,
}: Props) {
  const [answer, setAnswer] = useState('');
  const [hasBuzzed, setHasBuzzed] = useState(false);
  const baseAnswerBottomOffset = bottomPadding + (questionOnly ? 0 : spacing.md);
  const keyboardAnimatedValue = useRef(new Animated.Value(baseAnswerBottomOffset)).current;
  const keyboardVisibleRef = useRef(false);
  const wordIndexRef = useRef(0);

  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const dangerColor = useThemeColor({}, 'error');
  const brandColor = useThemeColor({}, 'brand');
  const mutedColor = useThemeColor({}, 'muted');
  const isBuzzerControlled = isCurrentPlayerBuzzer !== undefined;
  const shouldUseBuzzTimer = isBuzzerControlled || buzzTimerEnd != null;
  const activeHasBuzzed = isBuzzerControlled ? isCurrentPlayerBuzzer : hasBuzzed;
  const isQueued = buzzQueuePosition != null;

  // Refs for keyboard handler
  const stateRef = useRef({ isPlaying, hasBuzzed: activeHasBuzzed, result, answer });
  stateRef.current = { isPlaying, hasBuzzed: activeHasBuzzed, result, answer };
  const submittedRef = useRef(false);

  useEffect(() => {
    wordIndexRef.current = 0;
  }, [question?.id, question?.question]);

  // Local timer end for the buzzing player (fallback when coordinator's buzzTimerEnd hasn't arrived)
  const [localBuzzEnd, setLocalBuzzEnd] = useState<number | null>(null);

  useEffect(() => {
    if (shouldUseBuzzTimer && activeHasBuzzed) {
      setLocalBuzzEnd(Date.now() + SCORING.BUZZ_TIMEOUT_SECONDS * 1000);
    } else {
      setLocalBuzzEnd(null);
    }
  }, [activeHasBuzzed, shouldUseBuzzTimer]);

  const effectiveTimerEnd = shouldUseBuzzTimer ? buzzTimerEnd ?? localBuzzEnd : null;

  // Buzz timer countdown
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!effectiveTimerEnd) {
      setTimerSeconds(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((effectiveTimerEnd - Date.now()) / 1000));
      setTimerSeconds(remaining);
      if (remaining <= 0) {
        setTimerSeconds(null);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [effectiveTimerEnd]);

  // No-buzz timer: starts when question is fully revealed and no one has buzzed.
  // Pauses while someone is buzzing, resumes with remaining time after a wrong answer.
  const [revealComplete, setRevealComplete] = useState(false);
  const [noBuzzTimerEnd, setNoBuzzTimerEnd] = useState<number | null>(null);
  const [noBuzzSeconds, setNoBuzzSeconds] = useState<number | null>(null);
  const noBuzzFiredRef = useRef(false);
  const noBuzzPausedRemainingRef = useRef<number | null>(null);

  // Start no-buzz timer when reveal completes (first time only)
  useEffect(() => {
    if (revealComplete && isPlaying && !activeHasBuzzed && !isBuzzLocked && !result && onNoBuzzTimeout) {
      // Only start if there's no saved remaining time (i.e. truly first start)
      if (noBuzzPausedRemainingRef.current == null && !noBuzzTimerEnd) {
        setNoBuzzTimerEnd(Date.now() + SCORING.BUZZ_TIMEOUT_SECONDS * 1000);
      } else if (noBuzzPausedRemainingRef.current != null) {
        // Resume from where we paused
        setNoBuzzTimerEnd(Date.now() + noBuzzPausedRemainingRef.current);
        noBuzzPausedRemainingRef.current = null;
      }
    }
  }, [revealComplete, isPlaying, activeHasBuzzed, isBuzzLocked, result, onNoBuzzTimeout, noBuzzTimerEnd]);

  // Pause no-buzz timer when someone buzzes; cancel on final result
  useEffect(() => {
    if (result) {
      // Question resolved — cancel entirely
      noBuzzPausedRemainingRef.current = null;
      setNoBuzzTimerEnd(null);
    } else if (activeHasBuzzed || isBuzzLocked) {
      // Someone is buzzing — pause by saving remaining time
      if (noBuzzTimerEnd) {
        noBuzzPausedRemainingRef.current = Math.max(0, noBuzzTimerEnd - Date.now());
        setNoBuzzTimerEnd(null);
      }
    }
  }, [activeHasBuzzed, isBuzzLocked, result, noBuzzTimerEnd]);

  // No-buzz countdown + auto-trigger
  useEffect(() => {
    if (!noBuzzTimerEnd) {
      setNoBuzzSeconds(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((noBuzzTimerEnd - Date.now()) / 1000));
      setNoBuzzSeconds(remaining);
      if (remaining <= 0 && !noBuzzFiredRef.current) {
        noBuzzFiredRef.current = true;
        setNoBuzzTimerEnd(null);
        setNoBuzzSeconds(null);
        onNoBuzzTimeout?.(question?.id);
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [noBuzzTimerEnd, onNoBuzzTimeout, question?.id]);

  // Track keyboard movement so the answer input rides with the keyboard.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const animateToKeyboardOffset = (toValue: number, event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      keyboardAnimatedValue.stopAnimation();
      Animated.timing(keyboardAnimatedValue, {
        toValue,
        duration: event.duration > 0 ? event.duration : 220,
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, (event) => {
      // If parent handles bottom safe area, subtract it from keyboard height
      // since the overlay's bottom is already inset by the safe area
      const adjustedHeight = parentHandlesBottomSafeArea
        ? Math.max(0, event.endCoordinates.height - insets.bottom)
        : event.endCoordinates.height;
      keyboardVisibleRef.current = true;
      animateToKeyboardOffset(Math.max(adjustedHeight, baseAnswerBottomOffset), event);
    });

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      keyboardVisibleRef.current = false;
      animateToKeyboardOffset(baseAnswerBottomOffset, event);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [baseAnswerBottomOffset, keyboardAnimatedValue, parentHandlesBottomSafeArea, insets.bottom]);

  useEffect(() => {
    if (!keyboardVisibleRef.current) {
      keyboardAnimatedValue.setValue(baseAnswerBottomOffset);
    }
  }, [baseAnswerBottomOffset, keyboardAnimatedValue]);

  // Reset on new question
  useEffect(() => {
    setAnswer('');
    setHasBuzzed(false);
    submittedRef.current = false;
    wordIndexRef.current = 0;
    setRevealComplete(false);
    setNoBuzzTimerEnd(null);
    noBuzzFiredRef.current = false;
    noBuzzPausedRemainingRef.current = null;
  }, [question?.id]);

  // Reset submitted flag when buzz state changes
  useEffect(() => {
    if (!activeHasBuzzed) submittedRef.current = false;
  }, [activeHasBuzzed]);

  // Reopen buzz overlay when prompted to give a more specific answer
  useEffect(() => {
    if (!isBuzzerControlled && promptText && !activeHasBuzzed && isPlaying && !result) {
      setHasBuzzed(true);
      setAnswer('');
      submittedRef.current = false;
    }
  }, [isBuzzerControlled, promptText, activeHasBuzzed, isPlaying, result]);

  // Auto-submit when buzz timer expires
  useEffect(() => {
    if (!effectiveTimerEnd || !activeHasBuzzed || submittedRef.current || result) return;

    const remaining = effectiveTimerEnd - Date.now();
    if (remaining <= 0) {
      // Timer already expired — submit immediately
      submittedRef.current = true;
      const currentAnswer = stateRef.current.answer;
      void onSubmitAnswer(currentAnswer.trim());
      setAnswer('');
      if (!isBuzzerControlled) {
        setHasBuzzed(false);
      }
      return;
    }

    const timer = setTimeout(() => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const currentAnswer = stateRef.current.answer;
      void onSubmitAnswer(currentAnswer.trim());
      setAnswer('');
      if (!isBuzzerControlled) {
        setHasBuzzed(false);
      }
    }, remaining);

    return () => clearTimeout(timer);
  }, [effectiveTimerEnd, activeHasBuzzed, isBuzzerControlled, result, onSubmitAnswer]);

  // Broadcast typing to other players
  const handleAnswerChange = (text: string) => {
    setAnswer(text);
    onBuzzTyping?.(text);
  };

  // Derived state - hasBuzzed means THIS user buzzed, so show answer input regardless of isBuzzLocked
  // Also keep open during prompt (prevents flicker between handleSubmit and prompt effect)
  const showWrongAnswerFlash = !!buzzerResult && !buzzerResult.isCorrect && !result;
  const isAnswering = (activeHasBuzzed || (!isBuzzerControlled && !!promptText && !result)) && isPlaying && !result && !showWrongAnswerFlash;
  const showResult = Boolean(result);
  const showNextButton = showResult;
  const shouldShowMainAction = !(showResult && hideMainActionWhenResult);
  const canBuzz = Boolean(
    question &&
    !isLoading &&
    isPlaying &&
    !activeHasBuzzed &&
    !isQueued &&
    !isSelfLockedOut &&
    !showNextButton &&
    (!isBuzzLocked || allowBuzzQueue)
  );
  const mainButtonDisabled = showNextButton
    ? !canGoNext || !question || isLoading || !isPlaying
    : !canBuzz;
  const mainActionLabel = showNextButton
    ? canGoNext ? 'Next' : 'Waiting for Host'
    : isQueued ? `Queued #${buzzQueuePosition}` : isBuzzLocked && allowBuzzQueue ? 'Join Queue' : 'Buzz';
  const showMainActionIcon = !showMainActionLabel && (
    mainActionLabel === 'Buzz' ||
    mainActionLabel === 'Next' ||
    mainActionLabel === 'Join Queue'
  );

  // Handlers
  const handleWordIndexChange = (index: number) => {
    wordIndexRef.current = index;
    onWordIndexChange?.(index);
  };

  const handleBuzz = () => {
    if (!canBuzz) return;
    if (!isBuzzerControlled && !isBuzzLocked) {
      setHasBuzzed(true);
    }
    onBuzz(wordIndexRef.current);
  };

  const handleSubmit = async () => {
    if (!isPlaying || !activeHasBuzzed || result) return;
    submittedRef.current = true;
    await onSubmitAnswer(answer.trim());
    setAnswer('');
    if (!isBuzzerControlled) {
      setHasBuzzed(false);
    }
  };

  const handleMainAction = () => {
    Keyboard.dismiss();
    if (showNextButton) {
      if (!canGoNext) return;
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

  const safeAreaBottomPadding = parentHandlesBottomSafeArea ? 0 : insets.bottom;
  const contentPaddingBottom = bottomPadding + safeAreaBottomPadding + (questionOnly ? 0 : spacing.lg);
  const answerInputContent = (
    <>
      {showSupplementalText && promptText ? (
        <View style={styles.promptHintContainer}>
          <ThemedText type="defaultSemiBold" style={[styles.promptHintText, { color: brandColor }]}>
            {promptText}
          </ThemedText>
        </View>
      ) : null}
      {showSupplementalText && timerSeconds != null && timerSeconds > 0 && (
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
        onChangeText={handleAnswerChange}
        onSubmit={handleSubmit}
        disabled={!question || isLoading}
        autoFocus
        placeholder={showSupplementalText ? undefined : ''}
      />
    </>
  );

  return (
    <View style={styles.root}>
      <ThemedView style={styles.container}>
        <View style={[styles.content, questionOnly && styles.questionOnlyContent, { paddingBottom: contentPaddingBottom }]}>
          {/* Header */}
          {showHeader ? (
            <View style={styles.header}>
              <View style={styles.headerText}>
                <ThemedText type="title">{title}</ThemedText>
                {typeof subtitle === 'string' ? (
                  <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
                ) : subtitle}
              </View>
              {headerRight}
            </View>
          ) : null}

          {topAccessory ? <View style={styles.topAccessory}>{topAccessory}</View> : null}

          {/* Question Card */}
          <View style={styles.questionWrapper}>
            <QuestionCard
              key={question?.id ?? question?.question ?? 'empty-question'}
              tossup={question ?? undefined}
              isLoading={isLoading}
              error={error}
              showAnswer={showResult}
              isBuzzed={activeHasBuzzed || isBuzzLocked}
              result={result ?? undefined}
              submittedAnswer={submittedAnswer}
              revealActive={isPlaying && !isBuzzLocked}
              revealSpeedOverride={revealSpeed}
              revealStartTime={revealStartTime}
              showRevealButton={false}
              showMeta={!questionOnly}
              questionOnly={questionOnly}
              onWordIndexChange={handleWordIndexChange}
              onFullQuestionRevealChange={setRevealComplete}
            />
            {overlay}
            {/* Show buzzer name when someone is buzzing / wrong answer flash / prompt.
                The wrong-answer flash is shown to EVERYONE (including the buzzer) so
                the player who got it wrong sees the Incorrect feedback before the
                reveal resumes. Typing/prompt overlays remain hidden from the buzzer. */}
            {buzzerName && isBuzzLocked && !showResult && (showWrongAnswerFlash || !activeHasBuzzed) && (
              <View style={[styles.buzzerOverlay, { backgroundColor: colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)' }]}>
                {buzzerResult && !buzzerResult.isCorrect ? (
                  <>
                    <ThemedText type="defaultSemiBold" style={[styles.buzzerText, { color: dangerColor }]}>
                      {buzzerName}: {buzzerResult.answer || '(no answer)'}
                    </ThemedText>
                    <ThemedText style={[styles.wrongLabel, { color: dangerColor }]}>
                      Incorrect!
                    </ThemedText>
                  </>
                ) : promptText ? (
                  <>
                    <ThemedText type="defaultSemiBold" style={[styles.buzzerText, { color: brandColor }]}>
                      {buzzerName} prompted
                    </ThemedText>
                    <ThemedText style={[styles.buzzerTypingText, { color: brandColor }]}>
                      {promptText}
                    </ThemedText>
                    {timerSeconds != null && timerSeconds > 0 && (
                      <ThemedText style={[styles.timerText, { color: timerSeconds <= 3 ? dangerColor : brandColor }]}>
                        {timerSeconds}s remaining
                      </ThemedText>
                    )}
                  </>
                ) : (
                  <>
                    <ThemedText type="defaultSemiBold" style={styles.buzzerText}>
                      {buzzerName} buzzed in...
                    </ThemedText>
                    {remoteBuzzerAnswer ? (
                      <ThemedText style={styles.buzzerTypingText}>
                        {remoteBuzzerAnswer}
                      </ThemedText>
                    ) : null}
                    {timerSeconds != null && timerSeconds > 0 && (
                      <ThemedText style={[styles.timerText, { color: timerSeconds <= 3 ? dangerColor : brandColor }]}>
                        {timerSeconds}s remaining
                      </ThemedText>
                    )}
                  </>
                )}
              </View>
            )}
            {/* No-buzz countdown: question fully revealed, no one buzzed yet */}
            {noBuzzSeconds != null && noBuzzSeconds > 0 && !activeHasBuzzed && !isBuzzLocked && !showResult && (
              <View style={[styles.noBuzzOverlay, { backgroundColor: colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)' }]}>
                <ThemedText style={[styles.noBuzzTimer, { color: noBuzzSeconds <= 3 ? dangerColor : brandColor }]}>
                  {noBuzzSeconds}s
                </ThemedText>
                <ThemedText style={styles.noBuzzHint}>to buzz</ThemedText>
              </View>
            )}
          </View>

          {showResult && resultAccessory ? resultAccessory : null}

          {/* Action button - Buzz or Next */}
          {shouldShowMainAction ? (
            <Pressable
              onPress={handleMainAction}
              disabled={mainButtonDisabled}
              accessibilityRole="button"
              accessibilityLabel={mainActionLabel}
              accessibilityState={{ disabled: mainButtonDisabled }}
              style={({ pressed }) => [
                styles.mainButton,
                questionOnly && styles.questionOnlyMainButton,
                {
                  backgroundColor: mainButtonDisabled ? mutedColor : showNextButton ? brandColor : dangerColor,
                  opacity: mainButtonDisabled ? 0.35 : pressed ? 0.9 : 1,
                },
              ]}>
              {showMainActionIcon ? (
                <MaterialIcons
                  name={showNextButton ? 'arrow-forward' : 'bolt'}
                  size={scale(28)}
                  color="#fff"
                />
              ) : (
                <ThemedText type="defaultSemiBold" style={styles.actionLabel}>
                  {mainActionLabel}
                </ThemedText>
              )}
            </Pressable>
          ) : null}

          {/* Extra info */}
          {showSupplementalText && result?.directedPrompt && (
            <ThemedText style={styles.prompt}>Directed prompt: {result.directedPrompt}</ThemedText>
          )}
          {showSupplementalText && error && onRetry && (
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
          {Platform.OS === 'ios' ? (
            <InputAccessoryView backgroundColor="transparent">
              <View style={styles.answerInputContainer}>
                {answerInputContent}
              </View>
            </InputAccessoryView>
          ) : (
            <Animated.View style={[styles.answerInputContainer, { marginBottom: keyboardAnimatedValue }]}>
              {answerInputContent}
            </Animated.View>
          )}
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
    gap: spacing.md,
  },
  questionOnlyContent: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  subtitle: {
    opacity: 0.8,
  },
  topAccessory: {
    zIndex: 1,
  },
  questionWrapper: {
    flex: 1,
    position: 'relative',
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  mainButton: {
    borderRadius: scale(16),
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  questionOnlyMainButton: {
    borderRadius: scale(22),
    minHeight: verticalScale(58),
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
  promptHintContainer: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  promptHintText: {
    fontSize: responsiveFont(15),
    fontStyle: 'italic',
    textAlign: 'center',
  },
  timerContainer: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  timerCountdown: {
    fontSize: responsiveFont(24),
    letterSpacing: 1,
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
  wrongLabel: {
    fontSize: responsiveFont(16),
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  buzzerTypingText: {
    fontSize: responsiveFont(15),
    opacity: 0.7,
    fontStyle: 'italic',
  },
  noBuzzOverlay: {
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    borderRadius: scale(16),
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  noBuzzTimer: {
    fontSize: responsiveFont(22),
    fontWeight: '700',
    letterSpacing: 1,
  },
  noBuzzHint: {
    fontSize: responsiveFont(14),
    opacity: 0.7,
  },
});
