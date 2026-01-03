import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnswerInput } from '@/components/quiz/AnswerInput';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useQuizSession } from '@/hooks/useQuizSession';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export default function PlayScreen() {
  const {
    currentQuestion,
    loadingQuestion,
    error,
    loadNextQuestion,
    judgeAnswer,
    skipQuestion,
    lastResult,
    clearError,
  } = useQuizSession();

  const [answer, setAnswer] = useState('');
  const [hasBuzzed, setHasBuzzed] = useState(false);
  const [playState, setPlayState] = useState<'idle' | 'active' | 'paused'>('idle');
  const [hasFullyRevealedQuestion, setHasFullyRevealedQuestion] = useState(false);

  const borderColor = useThemeColor({}, 'border');
  const dangerColor = useThemeColor({}, 'error');
  const brandColor = useThemeColor({}, 'brand');
  const skipTextColor = useThemeColor({}, 'text');
  const tabBarHeight = useBottomTabBarHeight();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  // Refs for callbacks that need current values
  const playStateRef = useRef(playState);
  const lastResultRef = useRef(lastResult);
  const hasBuzzedRef = useRef(hasBuzzed);
  const answerRef = useRef(answer);
  const currentQuestionRef = useRef(currentQuestion);
  const submittedRef = useRef(false);

  // Sync refs
  useEffect(() => { playStateRef.current = playState; }, [playState]);
  useEffect(() => { lastResultRef.current = lastResult; }, [lastResult]);
  useEffect(() => { hasBuzzedRef.current = hasBuzzed; }, [hasBuzzed]);
  useEffect(() => { answerRef.current = answer; }, [answer]);
  useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);

  // Reset on new question
  useEffect(() => {
    setAnswer('');
    setHasBuzzed(false);
    setHasFullyRevealedQuestion(false);
    submittedRef.current = false;
  }, [currentQuestion?.id]);

  // Reset submitted flag when buzz state changes
  useEffect(() => {
    if (!hasBuzzed) submittedRef.current = false;
  }, [hasBuzzed]);

  // Auto-submit empty answer when keyboard hides (use willHide on iOS for faster response)
  useEffect(() => {
    const eventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sub = Keyboard.addListener(eventName, () => {
      if (
        playStateRef.current !== 'active' ||
        !hasBuzzedRef.current ||
        lastResultRef.current ||
        submittedRef.current ||
        answerRef.current.trim().length > 0
      ) return;

      submittedRef.current = true;
      judgeAnswer('');
    });
    return () => sub.remove();
  }, [judgeAnswer]);

  // Pause when leaving screen (only on blur, not on state changes)
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (playStateRef.current === 'active' && currentQuestionRef.current && !lastResultRef.current) {
          setPlayState('paused');
        }
      };
    }, [])
  );

  // Derived state
  const isAnswering = hasBuzzed && playState === 'active' && !lastResult;
  const controlsDisabled = playState !== 'active';
  const buttonMode = lastResult ? 'next' : hasFullyRevealedQuestion ? 'show-answer' : 'skip';

  const showPlayOverlay =
    playState !== 'active' &&
    (playState === 'idle' || (playState === 'paused' && currentQuestion && !lastResult));

  // Handlers
  const handleSubmit = () => {
    if (playState !== 'active' || !hasBuzzed || lastResult) return;
    submittedRef.current = true;
    judgeAnswer(answer.trim());
  };

  const handleBuzz = () => {
    if (!currentQuestion || loadingQuestion || hasBuzzed || playState !== 'active') return;
    setHasBuzzed(true);
    clearError();
  };

  const handleSkipOrNext = () => {
    if (!currentQuestion || loadingQuestion) return;
    if (!lastResult) skipQuestion();
    setAnswer('');
    setHasBuzzed(false);
    clearError();
    void loadNextQuestion();
  };

  const handleShowAnswer = () => {
    if (!currentQuestion || loadingQuestion || hasBuzzed || lastResult || playState !== 'active') return;
    setHasBuzzed(true);
    setAnswer('');
    clearError();
    judgeAnswer('');
  };

  const handlePrimaryAction = () => {
    Keyboard.dismiss();
    if (buttonMode === 'next') {
      // Go to next question
      setAnswer('');
      setHasBuzzed(false);
      clearError();
      void loadNextQuestion();
    } else if (buttonMode === 'show-answer') {
      handleShowAnswer();
    } else {
      handleSkipOrNext();
    }
  };

  const handlePlayOverlayPress = () => {
    if (playState === 'idle') {
      setPlayState('active');
      setAnswer('');
      setHasBuzzed(false);
      clearError();
      void loadNextQuestion();
    } else if (playState === 'paused') {
      setPlayState('active');
    }
  };

  const handleRetry = () => {
    setAnswer('');
    setHasBuzzed(false);
    clearError();
    void loadNextQuestion();
  };

  // Styling
  const overlayBackground = colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
  const overlayTextColor = colorScheme === 'dark' ? '#fff' : '#0f172a';
  const contentPaddingBottom = spacing.lg + (Platform.OS === 'ios' ? tabBarHeight : 0) + insets.bottom;

  return (
    <View style={styles.rootContainer}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          {/* Main content - always static */}
          <View style={[styles.content, { paddingBottom: contentPaddingBottom }]}>
            {/* Header */}
            <View style={styles.header}>
              <ThemedText type="title">QuizBowl Practice</ThemedText>
              <ThemedText style={styles.subtitle}>
                Powered by QBReader — fresh tossups every time you buzz.
              </ThemedText>
            </View>

            {/* Question Card */}
            <View style={styles.questionWrapper}>
              <QuestionCard
                tossup={currentQuestion}
                isLoading={loadingQuestion}
                error={error}
                showAnswer={Boolean(lastResult)}
                isBuzzed={hasBuzzed}
                result={lastResult}
                revealActive={playState === 'active'}
                onFullQuestionRevealChange={setHasFullyRevealedQuestion}
              />

              {/* Play/Pause overlay */}
              {showPlayOverlay && (
                <Pressable
                  onPress={handlePlayOverlayPress}
                  style={({ pressed }) => [
                    styles.playOverlay,
                    { backgroundColor: overlayBackground, opacity: pressed ? 0.9 : 1 },
                  ]}>
                  <ThemedText type="defaultSemiBold" style={[styles.playOverlayLabel, { color: overlayTextColor }]}>
                    {playState === 'paused' ? 'Tap to Continue' : 'Tap to Play'}
                  </ThemedText>
                </Pressable>
              )}
            </View>

            {/* Action buttons - always visible */}
            <View style={styles.actions}>
              <Pressable
                onPress={handleBuzz}
                disabled={!currentQuestion || loadingQuestion || hasBuzzed || Boolean(lastResult) || controlsDisabled}
                style={({ pressed }) => [
                  styles.buzzButton,
                  {
                    backgroundColor: dangerColor,
                    opacity: !currentQuestion || loadingQuestion ? 0.25 : hasBuzzed || lastResult ? 0.6 : pressed ? 0.9 : 1,
                  },
                ]}>
                <ThemedText type="defaultSemiBold" style={styles.actionLabel}>Buzz</ThemedText>
              </Pressable>

              <Pressable
                onPress={handlePrimaryAction}
                disabled={!currentQuestion || loadingQuestion || controlsDisabled}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    borderColor,
                    borderWidth: buttonMode === 'next' ? 0 : 1,
                    backgroundColor: buttonMode === 'next' ? brandColor : 'transparent',
                    opacity: !currentQuestion || loadingQuestion ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}>
                <ThemedText
                  type="defaultSemiBold"
                  style={[styles.secondaryLabel, { color: buttonMode === 'next' ? '#fff' : skipTextColor }]}>
                  {buttonMode === 'next' ? 'Next' : buttonMode === 'show-answer' ? 'Show Answer' : 'Skip'}
                </ThemedText>
              </Pressable>
            </View>

            {/* Extra info */}
            {lastResult?.directedPrompt && (
              <ThemedText style={styles.prompt}>Directed prompt: {lastResult.directedPrompt}</ThemedText>
            )}
            {error && (
              <Pressable onPress={handleRetry}>
                <ThemedText style={styles.error}>{error} Tap to try again.</ThemedText>
              </Pressable>
            )}
          </View>
        </ThemedView>
      </SafeAreaView>

      {/* Answer overlay - outside SafeAreaView for proper keyboard handling */}
      {isAnswering && (
        <KeyboardAvoidingView 
          behavior="padding" 
          style={[
            styles.answerOverlay, 
            { backgroundColor: colorScheme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)' }
          ]}
          keyboardVerticalOffset={0}
        >
          <Pressable style={styles.answerOverlayTouchable} onPress={Keyboard.dismiss} />
          <AnswerInput
            value={answer}
            onChangeText={setAnswer}
            onSubmit={handleSubmit}
            disabled={!currentQuestion || loadingQuestion}
            autoFocus
          />
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  safeArea: {
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
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  playOverlayLabel: {
    fontSize: responsiveFont(18),
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  buzzButton: {
    flex: 1,
    borderRadius: scale(14),
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: scale(14),
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  actionLabel: {
    color: '#fff',
    letterSpacing: 0.6,
  },
  secondaryLabel: {
    letterSpacing: 0.6,
  },
  prompt: {
    fontStyle: 'italic',
  },
  error: {
    color: '#E45858',
    fontWeight: '600',
  },
  // Answer overlay styles
  answerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  answerOverlayTouchable: {
    flex: 1,
  },
});
