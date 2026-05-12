import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuizGameLayout } from '@/components/quiz/QuizGameLayout';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useQuizSession } from '@/hooks/useQuizSession';
import { scale, spacing } from '@/utils/responsive';

export default function PlayScreen() {
  const {
    currentQuestion,
    loadingQuestion,
    error,
    loadNextQuestion,
    judgeAnswer,
    lastResult,
    promptInfo,
    clearError,
  } = useQuizSession();

  const [playState, setPlayState] = useState<'idle' | 'active' | 'paused'>('idle');
  const tabBarHeight = useBottomTabBarHeight();
  const colorScheme = useColorScheme();

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
      StatusBar.setHidden(true, 'fade');

      return () => {
        StatusBar.setHidden(false, 'fade');
        if (playStateRef.current === 'active' && currentQuestionRef.current && !lastResultRef.current) {
          setPlayState('paused');
        }
      };
    }, [])
  );

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

  const overlayBackground = colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
  const overlayIconColor = colorScheme === 'dark' ? '#fff' : '#0f172a';

  const backgroundColor = Colors[colorScheme ?? 'light'].background;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <QuizGameLayout
        title="QuizBowl Practice"
        subtitle="Powered by QBReader. Fresh tossups every time you buzz."
        showHeader={false}
        question={currentQuestion}
        isLoading={loadingQuestion}
        error={error}
        result={lastResult}
        isPlaying={playState === 'active'}
        onBuzz={handleBuzz}
        onSubmitAnswer={handleSubmitAnswer}
        onNext={handleNext}
        onRetry={handleRetry}
        promptText={promptInfo?.directedPrompt}
        questionOnly
        showMainActionLabel={false}
        showSupplementalText={false}
        bottomPadding={tabBarHeight}
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
});
