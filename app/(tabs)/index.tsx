import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Keyboard,
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
  const extraFooterPadding = Platform.OS === 'ios' ? tabBarHeight : 0;
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const playStateRef = useRef(playState);
  const currentQuestionRef = useRef(currentQuestion);
  const lastResultRef = useRef(lastResult);
  const hasBuzzedRef = useRef(hasBuzzed);
  const answerRef = useRef(answer);
  const submittedRef = useRef(false);
  const [keyboardToggle, setKeyboardToggle] = useState(0);

  useEffect(() => {
    setAnswer('');
    setHasBuzzed(false);
    setHasFullyRevealedQuestion(false);
  }, [currentQuestion?.id]);

  useEffect(() => {
    playStateRef.current = playState;
  }, [playState]);

  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);

  useEffect(() => {
    lastResultRef.current = lastResult;
  }, [lastResult]);

  useEffect(() => {
    hasBuzzedRef.current = hasBuzzed;
    if (!hasBuzzed) {
      submittedRef.current = false;
    }
  }, [hasBuzzed]);

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  useEffect(() => {
    submittedRef.current = false;
  }, [currentQuestion?.id]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardToggle((prev) => prev + 1);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardToggle((prev) => prev + 1);
      if (
        playStateRef.current !== 'active' ||
        !hasBuzzedRef.current ||
        lastResultRef.current ||
        submittedRef.current
      ) {
        return;
      }

      if (answerRef.current.trim().length > 0) {
        return;
      }

      submittedRef.current = true;
      judgeAnswer('');
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [judgeAnswer]);
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (
          playStateRef.current === 'active' &&
          currentQuestionRef.current &&
          !lastResultRef.current
        ) {
          setPlayState('paused');
        }
      };
    }, [])
  );

  type ButtonMode = 'skip' | 'show-answer' | 'next';
  const buttonMode: ButtonMode = lastResult
    ? 'next'
    : hasFullyRevealedQuestion
      ? 'show-answer'
      : 'skip';

  const handleSubmit = () => {
    if (playState !== 'active' || !hasBuzzed || lastResult) {
      return;
    }
    submittedRef.current = true;
    judgeAnswer(answer.trim());
  };

  const handleBuzz = () => {
    if (!currentQuestion || loadingQuestion || hasBuzzed || playState !== 'active') {
      return;
    }
    setHasBuzzed(true);
    clearError();
  };

  const handleSkip = () => {
    if (!currentQuestion || loadingQuestion) {
      return;
    }
    if (!lastResult) {
      skipQuestion();
    }
    setAnswer('');
    setHasBuzzed(false);
    clearError();
    void loadNextQuestion();
  };

  const handleShowAnswer = () => {
    if (
      !currentQuestion ||
      loadingQuestion ||
      hasBuzzed ||
      lastResult ||
      playState !== 'active'
    ) {
      return;
    }
    setHasBuzzed(true);
    setAnswer('');
    clearError();
    judgeAnswer('');
  };

  const handleRetry = () => {
    setAnswer('');
    setHasBuzzed(false);
    clearError();
    void loadNextQuestion();
  };

  const handleFullQuestionRevealChange = useCallback((revealed: boolean) => {
    setHasFullyRevealedQuestion(revealed);
  }, []);

  const handlePrimaryAction = () => {
    if (buttonMode === 'show-answer') {
      Keyboard.dismiss();
      handleShowAnswer();
      return;
    }
    Keyboard.dismiss();
    handleSkip();
  };

  const handleOverlayPress = () => {
    if (playState === 'idle') {
      setPlayState('active');
      setAnswer('');
      setHasBuzzed(false);
      clearError();
      void loadNextQuestion();
      return;
    }

    if (playState === 'paused') {
      setPlayState('active');
    }
  };

  const showOverlay =
    playState !== 'active' &&
    (playState === 'idle' || (playState === 'paused' && currentQuestion && !lastResult));
  const overlayLabel = playState === 'paused' ? 'Click to Continue' : 'Click to Play';
  const overlayBackground =
    colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
  const overlayTextColor = colorScheme === 'dark' ? '#fff' : '#0f172a';
  const controlsDisabled = playState !== 'active';
  const isAnswering = hasBuzzed && playState === 'active' && !lastResult;
  const answerSectionHeight = MIN_TOUCH_TARGET;
  const contentPaddingBottom = isAnswering
    ? spacing.sm
    : spacing.lg + extraFooterPadding + insets.bottom;
  const showActions = !isAnswering;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={styles.flex}>
        <ThemedView style={styles.container}>
          <View style={[styles.content, { paddingBottom: contentPaddingBottom }]}>
            <View style={styles.mainSection}>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="title">QuizBowl Practice</ThemedText>
                  <ThemedText style={styles.subtitle}>
                    Powered by QBReader — fresh tossups every time you buzz.
                  </ThemedText>
                </View>
              </View>
              <View style={styles.questionWrapper}>
                <QuestionCard
                  tossup={currentQuestion}
                  isLoading={loadingQuestion}
                  error={error}
                  showAnswer={Boolean(lastResult)}
                  isBuzzed={hasBuzzed}
                  result={lastResult}
                  revealActive={playState === 'active'}
                  onFullQuestionRevealChange={handleFullQuestionRevealChange}
                  anchorToBottomOnBuzz
                  scrollAnchorKey={keyboardToggle}
                />
                {showOverlay ? (
                  <Pressable
                    onPress={handleOverlayPress}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.questionOverlay,
                      {
                        backgroundColor: overlayBackground,
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}>
                    <ThemedText type="defaultSemiBold" style={[styles.overlayLabel, { color: overlayTextColor }]}>
                      {overlayLabel}
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </View>
              <View style={styles.footerSection}>
              {showActions ? (
                <View style={styles.actions}>
                  <Pressable
                    onPress={handleBuzz}
                    disabled={
                      !currentQuestion ||
                      loadingQuestion ||
                      hasBuzzed ||
                      Boolean(lastResult) ||
                      controlsDisabled
                    }
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.buzzButton,
                      {
                        backgroundColor: dangerColor,
                        opacity:
                          !currentQuestion || loadingQuestion
                            ? 0.25
                            : hasBuzzed || lastResult
                              ? 0.6
                              : pressed
                                ? 0.9
                                : 1,
                      },
                    ]}>
                    <ThemedText type="defaultSemiBold" style={styles.actionLabel}>
                      Buzz
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={handlePrimaryAction}
                    disabled={!currentQuestion || loadingQuestion || controlsDisabled}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.skipButton,
                      {
                        borderColor,
                        borderWidth: buttonMode === 'next' ? 0 : 1,
                        backgroundColor:
                          buttonMode === 'next' ? brandColor : 'transparent',
                        opacity:
                          !currentQuestion || loadingQuestion
                            ? 0.4
                            : pressed
                              ? 0.7
                              : 1,
                      },
                    ]}>
                    <ThemedText
                      type="defaultSemiBold"
                      style={[
                        styles.skipLabel,
                        { color: buttonMode === 'next' ? '#fff' : skipTextColor },
                      ]}>
                      {buttonMode === 'next'
                        ? 'Next'
                        : buttonMode === 'show-answer'
                          ? 'Show Answer'
                          : 'Skip'}
                    </ThemedText>
                  </Pressable>
                </View>
              ) : null}
              <View style={[styles.answerSection, { minHeight: answerSectionHeight }]}>
                {isAnswering ? (
                  <AnswerInput
                    value={answer}
                    onChangeText={setAnswer}
                    onSubmit={handleSubmit}
                    disabled={
                      !currentQuestion ||
                      loadingQuestion ||
                      controlsDisabled
                    }
                    autoFocus={hasBuzzed && !lastResult}
                  />
                ) : (
                  <View style={styles.answerPlaceholder} pointerEvents="none" />
                )}
              </View>
              {lastResult?.directedPrompt ? (
                <ThemedText style={styles.prompt}>
                  Directed prompt: {lastResult.directedPrompt}
                </ThemedText>
              ) : null}
              {error ? (
                <Pressable onPress={handleRetry}>
                  <ThemedText style={styles.error}>
                    {error} Tap to try again.
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
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
  mainSection: {
    gap: spacing.lg,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  subtitle: {
    marginTop: spacing.xs,
    opacity: 0.8,
  },
  questionWrapper: {
    flex: 1,
    position: 'relative',
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  questionOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  footerSection: {
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
  skipButton: {
    flex: 1,
    borderRadius: scale(14),
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: scale(1),
    minHeight: MIN_TOUCH_TARGET,
  },
  actionLabel: {
    color: '#fff',
    letterSpacing: 0.6,
  },
  skipLabel: {
    letterSpacing: 0.6,
  },
  answerSection: {
    marginTop: -spacing.xs,
  },
  answerPlaceholder: {
    flex: 1,
  },
  prompt: {
    fontStyle: 'italic',
  },
  error: {
    color: '#E45858',
    fontWeight: '600',
  },
});
