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
import { DirectivePill } from '@/components/quiz/DirectivePill';
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
  const brandColor = useThemeColor({}, 'brand');
  const dangerColor = useThemeColor({}, 'error');
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

  const canSubmit = useMemo(
    () =>
      Boolean(answer.trim()) &&
      Boolean(currentQuestion) &&
      !loadingQuestion &&
      !lastResult,
    [answer, currentQuestion, loadingQuestion, lastResult]
  );

  const handleSubmit = () => {
    if (!canSubmit) {
      return;
    }

    judgeAnswer(answer);
    setShowAnswer(true);
  };

  const handleNext = () => {
    if (currentQuestion && !lastResult) {
      skipQuestion();
    }
    setAnswer('');
    setShowAnswer(false);
    setHasBuzzed(false);
    clearError();
    void loadNextQuestion();
  };

  const handleBuzz = () => {
    if (!currentQuestion || loadingQuestion || hasBuzzed) {
      return;
    }
    setHasBuzzed(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        style={styles.flex}>
        <ThemedView style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <ThemedText type="title">QuizBowl Practice</ThemedText>
                <ThemedText style={styles.subtitle}>
                  Powered by QBReader — fresh tossups every time you buzz.
                </ThemedText>
              </View>
              <DirectivePill result={lastResult} />
            </View>
            <QuestionCard
              tossup={currentQuestion}
              isLoading={loadingQuestion}
              error={error}
              showAnswer={showAnswer || Boolean(lastResult)}
              isBuzzed={hasBuzzed}
            />
            <Pressable
              onPress={handleBuzz}
              disabled={!currentQuestion || loadingQuestion || hasBuzzed}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.buzzButton,
                {
                  backgroundColor: dangerColor,
                  opacity:
                    !currentQuestion || loadingQuestion
                      ? 0.3
                      : hasBuzzed
                        ? 0.6
                        : pressed
                          ? 0.8
                          : 1,
                },
              ]}>
              <ThemedText type="defaultSemiBold" style={styles.buzzLabel}>
                {hasBuzzed ? 'Buzzed' : 'Buzz'}
              </ThemedText>
            </Pressable>
            {lastResult?.directedPrompt ? (
              <ThemedText style={styles.prompt}>
                Directed prompt: {lastResult.directedPrompt}
              </ThemedText>
            ) : null}
            {error ? (
              <Pressable onPress={handleNext}>
                <ThemedText style={styles.error}>
                  {error} Tap to try again.
                </ThemedText>
              </Pressable>
            ) : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: 20 + extraFooterPadding }]}>
            <AnswerInput
              value={answer}
              onChangeText={setAnswer}
              onSubmit={handleSubmit}
              disabled={!currentQuestion || loadingQuestion}
            />
            <View style={styles.buttonRow}>
              <Pressable
                onPress={() => setShowAnswer((previous) => !previous)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor, opacity: pressed ? 0.7 : 1 },
                ]}
                disabled={!currentQuestion}>
                <ThemedText type="defaultSemiBold">
                  {showAnswer ? 'Hide' : 'Reveal'} Answer
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleNext}
                disabled={loadingQuestion}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: brandColor,
                    opacity: loadingQuestion ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}>
                <ThemedText type="defaultSemiBold">
                  {loadingQuestion ? 'Loading…' : 'Next Tossup'}
                </ThemedText>
              </Pressable>
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
  footer: {
    padding: 20,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    backgroundColor: 'transparent',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  buzzButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buzzLabel: {
    color: '#fff',
    letterSpacing: 0.6,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  prompt: {
    fontStyle: 'italic',
  },
  error: {
    color: '#E45858',
    fontWeight: '600',
  },
});
