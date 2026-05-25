import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { QuizGameLayout } from '@/components/quiz/QuizGameLayout';
import { FLOATING_TAB_BAR_SURFACE_HEIGHT } from '@/components/ui/FloatingTabBar';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useQuizSession } from '@/hooks/useQuizSession';
import { scale, spacing } from '@/utils/responsive';

const SKIP_TRANSITION_COOLDOWN_MS = 350;

export default function PlayScreen() {
  const {
    currentQuestion,
    loadingQuestion,
    error,
    loadNextQuestion,
    judgeAnswer,
    lastResult,
    lastAnswer,
    promptInfo,
    clearError,
    skipQuestion,
  } = useQuizSession();

  const [playState, setPlayState] = useState<'idle' | 'active' | 'paused'>('idle');
  const [isSkipping, setIsSkipping] = useState(false);
  const colorScheme = useColorScheme();
  const skipInFlightRef = useRef(false);
  const skipCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for focus handler
  const playStateRef = useRef(playState);
  const currentQuestionRef = useRef(currentQuestion);
  const lastResultRef = useRef(lastResult);
  playStateRef.current = playState;
  currentQuestionRef.current = currentQuestion;
  lastResultRef.current = lastResult;

  // Pause when leaving screen
  useFocusEffect(
    useCallback(() => {
      StatusBar.setHidden(false, 'fade');

      return () => {
        StatusBar.setHidden(false, 'fade');
        if (playStateRef.current === 'active' && currentQuestionRef.current && !lastResultRef.current) {
          setPlayState('paused');
        }
      };
    }, [])
  );

  useEffect(() => {
    return () => {
      if (skipCooldownTimerRef.current) {
        clearTimeout(skipCooldownTimerRef.current);
      }
    };
  }, []);

  // Show overlay when:
  // - idle (user hasn't started yet)
  // - paused with a current question (user navigated away mid-question)
  // - paused but question was cleared (settings changed while paused)
  // - active but no question loaded yet (waiting for first question)
  const showPlayOverlay =
    playState === 'idle' ||
    (playState === 'paused' && currentQuestion && !lastResult) ||
    (playState === 'paused' && !currentQuestion) ||
    (playState === 'active' && !currentQuestion && !loadingQuestion);

  const handlePlayOverlayPress = () => {
    if (playState === 'idle') {
      setPlayState('active');
      clearError();
      void loadNextQuestion();
    } else if (playState === 'paused') {
      setPlayState('active');
      if (!currentQuestion) {
        clearError();
        void loadNextQuestion();
      }
    } else if (playState === 'active' && !currentQuestion) {
      // Edge case: active but no question loaded - try again
      clearError();
      void loadNextQuestion();
    }
  };

  const handleBuzz = () => {
    clearError();
  };

  const handleSubmitAnswer = async (answer: string) => {
    judgeAnswer(answer);
  };

  const handleNext = () => {
    clearError();
    void loadNextQuestion();
  };

  const handleRetry = () => {
    clearError();
    void loadNextQuestion();
  };

  const canSkipQuestion = Boolean(
    currentQuestion &&
    playState === 'active' &&
    !loadingQuestion &&
    !lastResult &&
    !isSkipping
  );

  const handleSkip = useCallback(async () => {
    if (!canSkipQuestion || skipInFlightRef.current) {
      return;
    }

    skipInFlightRef.current = true;
    setIsSkipping(true);
    clearError();
    skipQuestion();

    try {
      await loadNextQuestion();
    } finally {
      if (skipCooldownTimerRef.current) {
        clearTimeout(skipCooldownTimerRef.current);
      }
      skipCooldownTimerRef.current = setTimeout(() => {
        skipInFlightRef.current = false;
        skipCooldownTimerRef.current = null;
        setIsSkipping(false);
      }, SKIP_TRANSITION_COOLDOWN_MS);
    }
  }, [canSkipQuestion, clearError, loadNextQuestion, skipQuestion]);

  const overlayBackground = colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
  const overlayIconColor = colorScheme === 'dark' ? '#fff' : '#0f172a';

  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const skipButtonBackground = colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.86)' : 'rgba(255, 255, 255, 0.92)';
  const skipButtonBorder = colorScheme === 'dark' ? 'rgba(148, 163, 184, 0.5)' : 'rgba(15, 23, 42, 0.14)';
  const skipButtonText = colorScheme === 'dark' ? '#F8FAFC' : '#0F172A';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <QuizGameLayout
        key={currentQuestion?.id ?? currentQuestion?.question ?? 'empty-question'}
        title="QBReader Practice"
        subtitle="Powered by QBReader. Fresh tossups every time you buzz."
        showHeader={false}
        question={currentQuestion}
        isLoading={loadingQuestion}
        error={error}
        result={lastResult}
        submittedAnswer={lastAnswer}
        isPlaying={playState === 'active'}
        onBuzz={handleBuzz}
        onSubmitAnswer={handleSubmitAnswer}
        onNext={handleNext}
        onRetry={handleRetry}
        promptText={promptInfo?.directedPrompt}
        questionFooterAccessory={
          currentQuestion && playState === 'active' && !lastResult ? (
            <View style={styles.skipButtonWrap}>
              <Pressable
                onPress={() => { void handleSkip(); }}
                disabled={!canSkipQuestion}
                accessibilityRole="button"
                accessibilityLabel="Skip question"
                accessibilityState={{ disabled: !canSkipQuestion }}
                testID="play-skip-button"
                style={({ pressed }) => [
                  styles.skipButton,
                  {
                    backgroundColor: skipButtonBackground,
                    borderColor: skipButtonBorder,
                    opacity: !canSkipQuestion ? 0.45 : pressed ? 0.76 : 1,
                  },
                ]}>
                <MaterialIcons name="skip-next" size={scale(17)} color={skipButtonText} />
                <ThemedText type="defaultSemiBold" style={[styles.skipButtonLabel, { color: skipButtonText }]}>
                  SKIP
                </ThemedText>
              </Pressable>
            </View>
          ) : undefined
        }
        questionFooterAccessoryReservedHeight={spacing.xl * 2}
        questionOnly
        showMainActionLabel={false}
        showSupplementalText={false}
        bottomPadding={FLOATING_TAB_BAR_SURFACE_HEIGHT + spacing.md}
        parentHandlesBottomSafeArea
        overlay={
          showPlayOverlay ? (
            <Pressable
              onPress={handlePlayOverlayPress}
              accessibilityRole="button"
              accessibilityLabel={
                playState === 'paused'
                  ? 'Continue play'
                  : playState === 'active'
                    ? 'Load next question'
                    : 'Start playing'
              }
              testID="play-overlay-action"
              style={({ pressed }) => [
                styles.playOverlay,
                { backgroundColor: overlayBackground, opacity: pressed ? 0.9 : 1 },
              ]}>
              <MaterialIcons
                name={error ? 'refresh' : playState === 'paused' ? 'play-circle-outline' : 'play-arrow'}
                size={scale(54)}
                color={overlayIconColor}
              />
            </Pressable>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  skipButtonWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    minHeight: scale(34),
    minWidth: scale(74),
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: scale(2),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: scale(3) },
    shadowOpacity: 0.12,
    shadowRadius: scale(8),
    elevation: 2,
  },
  skipButtonLabel: {
    fontSize: scale(12),
    letterSpacing: 0.8,
  },
});
