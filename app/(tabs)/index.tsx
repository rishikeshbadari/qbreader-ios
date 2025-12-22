import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerInput } from '@/components/quiz/AnswerInput';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useQuizSession } from '@/hooks/useQuizSession';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';

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
  const playStateRef = useRef(playState);
  const currentQuestionRef = useRef(currentQuestion);
  const lastResultRef = useRef(lastResult);

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

  const canCheck = useMemo(
    () =>
      Boolean(currentQuestion) && !loadingQuestion && hasBuzzed && !lastResult,
    [currentQuestion, hasBuzzed, lastResult, loadingQuestion]
  );

  type ButtonMode = 'skip' | 'show-answer' | 'check' | 'next';
  const buttonMode: ButtonMode = hasBuzzed
    ? lastResult
      ? 'next'
      : 'check'
    : hasFullyRevealedQuestion
      ? 'show-answer'
      : 'skip';

  const handleSubmit = () => {
    if (!canCheck || playState !== 'active') {
      return;
    }

    judgeAnswer(answer);
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
    if (buttonMode === 'check') {
      handleSubmit();
      return;
    }
    if (buttonMode === 'show-answer') {
      handleShowAnswer();
      return;
    }
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        style={styles.flex}>
        <ThemedView style={styles.container}>
          <View style={[styles.content, { paddingBottom: 20 + extraFooterPadding }]}>
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
                  disabled={
                    buttonMode === 'check'
                      ? !canCheck || controlsDisabled
                      : !currentQuestion || loadingQuestion || controlsDisabled
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.skipButton,
                    {
                      borderColor,
                      borderWidth: buttonMode === 'check' ? 0 : 1,
                      backgroundColor:
                        buttonMode === 'check' ? brandColor : 'transparent',
                      opacity:
                        buttonMode === 'check'
                          ? !canCheck
                            ? 0.4
                            : pressed
                              ? 0.8
                              : 1
                          : !currentQuestion || loadingQuestion
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
                      { color: buttonMode === 'check' ? '#fff' : skipTextColor },
                    ]}>
                    {buttonMode === 'check'
                      ? 'Check'
                      : buttonMode === 'next'
                        ? 'Next'
                        : buttonMode === 'show-answer'
                          ? 'Show Answer'
                          : 'Skip'}
                  </ThemedText>
                </Pressable>
              </View>
              {hasBuzzed && playState === 'active' && !lastResult ? (
                <View style={styles.answerSection}>
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
                </View>
              ) : null}
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
    padding: 20,
    gap: 20,
  },
  mainSection: {
    gap: 20,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  subtitle: {
    marginTop: 4,
    opacity: 0.8,
  },
  questionWrapper: {
    flex: 1,
    position: 'relative',
    borderRadius: 24,
    overflow: 'hidden',
  },
  questionOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  overlayLabel: {
    fontSize: 18,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  footerSection: {
    marginTop: 'auto',
    gap: 16,
  },
  buzzButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionLabel: {
    color: '#fff',
    letterSpacing: 0.6,
  },
  skipLabel: {
    letterSpacing: 0.6,
  },
  answerSection: {
    marginTop: -4,
  },
  prompt: {
    fontStyle: 'italic',
  },
  error: {
    color: '#E45858',
    fontWeight: '600',
  },
});
