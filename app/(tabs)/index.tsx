import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
  const borderColor = useThemeColor({}, 'border');
  const dangerColor = useThemeColor({}, 'error');
  const brandColor = useThemeColor({}, 'brand');
  const skipTextColor = useThemeColor({}, 'text');
  const tabBarHeight = useBottomTabBarHeight();
  const extraFooterPadding = Platform.OS === 'ios' ? tabBarHeight : 0;

  useEffect(() => {
    if (!currentQuestion && !loadingQuestion) {
      void loadNextQuestion();
    }
  }, [currentQuestion, loadNextQuestion, loadingQuestion]);

  useEffect(() => {
    setAnswer('');
    setHasBuzzed(false);
  }, [currentQuestion?.id]);

  const canCheck = useMemo(
    () =>
      Boolean(currentQuestion) && !loadingQuestion && hasBuzzed && !lastResult,
    [currentQuestion, hasBuzzed, lastResult, loadingQuestion]
  );

  const buttonMode: 'skip' | 'check' | 'next' = hasBuzzed
    ? lastResult
      ? 'next'
      : 'check'
    : 'skip';

  const handleSubmit = () => {
    if (!canCheck) {
      return;
    }

    judgeAnswer(answer);
  };

  const handleBuzz = () => {
    if (!currentQuestion || loadingQuestion || hasBuzzed) {
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

  const handleRetry = () => {
    setAnswer('');
    setHasBuzzed(false);
    clearError();
    void loadNextQuestion();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        style={styles.flex}>
        <ThemedView style={styles.container}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: 40 + extraFooterPadding }]}
            keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <ThemedText type="title">QuizBowl Practice</ThemedText>
                <ThemedText style={styles.subtitle}>
                  Powered by QBReader — fresh tossups every time you buzz.
                </ThemedText>
              </View>
            </View>
            <QuestionCard
              tossup={currentQuestion}
              isLoading={loadingQuestion}
              error={error}
              showAnswer={Boolean(lastResult)}
              isBuzzed={hasBuzzed}
              result={lastResult}
            />
            <View style={styles.actions}>
              <Pressable
                onPress={handleBuzz}
                disabled={
                  !currentQuestion || loadingQuestion || hasBuzzed || Boolean(lastResult)
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
                onPress={buttonMode === 'check' ? handleSubmit : handleSkip}
                disabled={
                  buttonMode === 'check'
                    ? !canCheck
                    : !currentQuestion || loadingQuestion
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
                      : 'Skip'}
                </ThemedText>
              </Pressable>
            </View>
            {hasBuzzed ? (
              <View style={styles.answerSection}>
                <AnswerInput
                  value={answer}
                  onChangeText={setAnswer}
                  onSubmit={handleSubmit}
                  disabled={!currentQuestion || loadingQuestion || Boolean(lastResult)}
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
          </ScrollView>
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
    padding: 20,
    gap: 20,
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
  actions: {
    flexDirection: 'row',
    gap: 12,
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
