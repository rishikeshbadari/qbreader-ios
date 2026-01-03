import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuizGameLayout } from '@/components/quiz/QuizGameLayout';
import { ThemedText } from '@/components/ThemedText';
import { useQuizSession } from '@/hooks/useQuizSession';
import { useColorScheme } from '@/hooks/useColorScheme';
import { responsiveFont, scale, spacing } from '@/utils/responsive';

export default function PlayScreen() {
  const {
    currentQuestion,
    loadingQuestion,
    error,
    loadNextQuestion,
    judgeAnswer,
    lastResult,
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
      return () => {
        if (playStateRef.current === 'active' && currentQuestionRef.current && !lastResultRef.current) {
          setPlayState('paused');
        }
      };
    }, [])
  );

  const showPlayOverlay =
    playState !== 'active' &&
    (playState === 'idle' || (playState === 'paused' && currentQuestion && !lastResult));

  const handlePlayOverlayPress = () => {
    if (playState === 'idle') {
      setPlayState('active');
      clearError();
      void loadNextQuestion();
    } else if (playState === 'paused') {
      setPlayState('active');
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
  const overlayTextColor = colorScheme === 'dark' ? '#fff' : '#0f172a';

  return (
    <SafeAreaView style={styles.safeArea}>
      <QuizGameLayout
        title="QuizBowl Practice"
        subtitle="Powered by QBReader — fresh tossups every time you buzz."
        question={currentQuestion}
        isLoading={loadingQuestion}
        error={error}
        result={lastResult}
        isPlaying={playState === 'active'}
        onBuzz={handleBuzz}
        onSubmitAnswer={handleSubmitAnswer}
        onNext={handleNext}
        onRetry={handleRetry}
        bottomPadding={tabBarHeight}
        overlay={
          showPlayOverlay ? (
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
  playOverlayLabel: {
    fontSize: responsiveFont(18),
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
