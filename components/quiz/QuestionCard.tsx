import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useSettings } from '@/hooks/useSettings';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { AnswerResult, Tossup } from '@/types/qb';
import { directiveLabel, normalizeDirective } from '@/utils/directives';
import { getRevealIntervalMs, getVisibleWordCountForTime } from '@/utils/revealTiming';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

interface Props {
  tossup?: Tossup;
  isLoading: boolean;
  error?: string;
  showAnswer: boolean;
  isBuzzed?: boolean;
  result?: AnswerResult;
  submittedAnswer?: string;
  revealActive?: boolean;
  onFullQuestionRevealChange?: (isRevealed: boolean) => void;
  onWordIndexChange?: (wordIndex: number) => void;
  revealSpeedOverride?: number;
  revealStartTime?: number | null;
  showRevealButton?: boolean;
  showMeta?: boolean;
  questionOnly?: boolean;
}

export function QuestionCard({
  tossup,
  isLoading,
  error,
  showAnswer,
  isBuzzed = false,
  result,
  submittedAnswer,
  revealActive = true,
  onFullQuestionRevealChange,
  onWordIndexChange,
  revealSpeedOverride,
  revealStartTime,
  showRevealButton = true,
  showMeta = true,
  questionOnly = false,
}: Props) {
  const colorScheme = useColorScheme();
  const { revealSpeed } = useSettings();
  const effectiveRevealSpeed =
    typeof revealSpeedOverride === 'number' ? revealSpeedOverride : revealSpeed;
  const borderColor = useThemeColor({}, 'border');
  const mutedColor = useThemeColor({}, 'muted');
  const successColor = useThemeColor({}, 'success');
  const warningColor = useThemeColor({}, 'warning');
  const errorColor = useThemeColor({}, 'error');
  const brandColor = useThemeColor({}, 'brand');
  const [displayedQuestion, setDisplayedQuestion] = useState('');
  const animationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buzzedRef = useRef(isBuzzed);
  const onWordIndexChangeRef = useRef(onWordIndexChange);
  const questionScrollRef = useRef<ScrollView | null>(null);
  const [hasRevealedFullQuestion, setHasRevealedFullQuestion] = useState(false);
  const wordsRef = useRef<string[]>([]);
  const revealIndexRef = useRef(0);
  const revealStartTimeRef = useRef(revealStartTime);
  const revealIntervalMs = getRevealIntervalMs(effectiveRevealSpeed);
  const scrollPaddingBottom = 0;
  const shouldAnimateQuestion =
    Boolean(tossup?.question) &&
    !isLoading &&
    !error &&
    !showAnswer &&
    !hasRevealedFullQuestion &&
    revealIntervalMs > 0;
  const isRevealRunning = shouldAnimateQuestion && revealActive;
  const canShowRevealButton =
    shouldAnimateQuestion && revealActive && showRevealButton && !isBuzzed && !questionOnly;

  useEffect(() => {
    setHasRevealedFullQuestion(false);
  }, [tossup?.id, tossup?.question]);

  useEffect(() => {
    onWordIndexChangeRef.current = onWordIndexChange;
  }, [onWordIndexChange]);

  useEffect(() => {
    revealStartTimeRef.current = revealStartTime;
  }, [revealStartTime]);

  const clearAnimationTimeout = () => {
    if (animationTimeout.current) {
      clearTimeout(animationTimeout.current);
      animationTimeout.current = null;
    }
  };

  useEffect(() => {
    buzzedRef.current = isBuzzed;
    if (isBuzzed) {
      clearAnimationTimeout();
    }
  }, [isBuzzed]);

  useEffect(() => {
    const questionText = tossup?.question ?? '';
    clearAnimationTimeout();

    if (!tossup || !questionText || isLoading || error) {
      wordsRef.current = [];
      revealIndexRef.current = 0;
      setDisplayedQuestion('');
      return;
    }

    const words = questionText.split(/\s+/).filter(Boolean);
    wordsRef.current = words;

    const currentRevealStartTime = revealStartTimeRef.current;

    if (showAnswer || revealIntervalMs === 0) {
      revealIndexRef.current = words.length;
      setDisplayedQuestion(questionText);
      onWordIndexChangeRef.current?.(words.length);
      if (!hasRevealedFullQuestion) {
        setHasRevealedFullQuestion(true);
      }
      return;
    }

    if (hasRevealedFullQuestion) {
      if (currentRevealStartTime != null && revealIntervalMs > 0) {
        const visibleWordCount = getVisibleWordCountForTime(
          currentRevealStartTime,
          revealIntervalMs,
          words.length,
        );
        if (visibleWordCount < words.length) {
          revealIndexRef.current = visibleWordCount;
          setDisplayedQuestion(words.slice(0, visibleWordCount).join(' '));
          onWordIndexChangeRef.current?.(visibleWordCount);
          setHasRevealedFullQuestion(false);
          return;
        }
      }

      revealIndexRef.current = words.length;
      setDisplayedQuestion(questionText);
      onWordIndexChangeRef.current?.(words.length);
      return;
    }

    if (shouldAnimateQuestion && words.length > 0) {
      let visibleWordCount = 1;
      if (currentRevealStartTime != null && revealIntervalMs > 0) {
        visibleWordCount = getVisibleWordCountForTime(
          currentRevealStartTime,
          revealIntervalMs,
          words.length,
        );
      }

      revealIndexRef.current = visibleWordCount;
      setDisplayedQuestion(words.slice(0, visibleWordCount).join(' '));
      onWordIndexChangeRef.current?.(visibleWordCount);

      if (visibleWordCount >= words.length) {
        setHasRevealedFullQuestion((prev) => (prev ? prev : true));
      }
    } else {
      revealIndexRef.current = 0;
      setDisplayedQuestion('');
    }
  }, [
    tossup,
    tossup?.id,
    tossup?.question,
    isLoading,
    error,
    showAnswer,
    revealStartTime,
    hasRevealedFullQuestion,
    revealIntervalMs,
    shouldAnimateQuestion,
  ]);

  // Track whether the initial revealStartTime sync has been applied for this question
  const initialSyncAppliedRef = useRef(false);
  useEffect(() => {
    initialSyncAppliedRef.current = false;
  }, [tossup?.id, tossup?.question]);

  useEffect(() => {
    if (!isRevealRunning) {
      clearAnimationTimeout();
      return;
    }

    const words = wordsRef.current;

    // Sync to revealStartTime ONLY on the first reveal of a new question.
    // This catches up devices that received the question late.
    // On resume after a buzz pause, skip this — continue from where we stopped.
    if (!initialSyncAppliedRef.current && revealStartTime && revealIntervalMs > 0 && revealIndexRef.current < words.length) {
      initialSyncAppliedRef.current = true;
      const elapsed = Date.now() - revealStartTime;
      const targetIndex = Math.max(
        0,
        Math.min(Math.floor(elapsed / revealIntervalMs) + 1, words.length)
      );

      if (targetIndex > revealIndexRef.current) {
        revealIndexRef.current = targetIndex;
        setDisplayedQuestion(words.slice(0, targetIndex).join(' '));
        onWordIndexChangeRef.current?.(targetIndex);

        if (targetIndex >= words.length) {
          setHasRevealedFullQuestion((prev) => (prev ? prev : true));
          return;
        }
      }
    }

    if (revealIndexRef.current >= words.length) {
      setHasRevealedFullQuestion((prev) => (prev ? prev : true));
      clearAnimationTimeout();
      return;
    }

    const shouldUseAnchoredSchedule = revealStartTime != null && revealIntervalMs > 0;

    const scheduleNextWord = () => {
      let delay = revealIntervalMs;
      if (shouldUseAnchoredSchedule) {
        const targetTime = revealStartTime + revealIndexRef.current * revealIntervalMs;
        delay = Math.max(0, targetTime - Date.now());
      }
      animationTimeout.current = setTimeout(revealNextWord, delay);
    };

    function revealNextWord() {
      const nextWord = words[revealIndexRef.current];
      if (typeof nextWord !== 'string') {
        return;
      }

      setDisplayedQuestion((previous) =>
        previous.length > 0 ? `${previous} ${nextWord}` : nextWord
      );
      revealIndexRef.current += 1;
      onWordIndexChangeRef.current?.(revealIndexRef.current);

      if (revealIndexRef.current < words.length && !buzzedRef.current) {
        // Re-anchor anchored multiplayer reveals to absolute clock targets to
        // prevent setTimeout drift and JS-thread-stall divergence between devices.
        scheduleNextWord();
      } else if (revealIndexRef.current >= words.length) {
        setHasRevealedFullQuestion((prev) => (prev ? prev : true));
      }
    }

    if (shouldUseAnchoredSchedule) {
      scheduleNextWord();
    } else {
      revealNextWord();
    }

    return () => {
      clearAnimationTimeout();
    };
  }, [isRevealRunning, tossup?.id, tossup?.question, revealIntervalMs, revealStartTime]);

  // Scroll effect
  useEffect(() => {
    if (!questionScrollRef.current) return;

    // Scroll to bottom when: showing answer, during reveal, or after full reveal
    if (showAnswer || isRevealRunning || hasRevealedFullQuestion) {
      questionScrollRef.current.scrollToEnd({ animated: true });
    } else {
      questionScrollRef.current.scrollTo({ y: 0, animated: false });
    }
  }, [displayedQuestion, showAnswer, isRevealRunning, hasRevealedFullQuestion]);

  useEffect(() => {
    onFullQuestionRevealChange?.(hasRevealedFullQuestion);
  }, [hasRevealedFullQuestion, onFullQuestionRevealChange]);

  const metaChips = [
    tossup?.category,
    tossup?.subcategory,
    tossup?.difficulty ? `Difficulty ${tossup.difficulty}` : undefined,
    typeof tossup?.questionNumber === 'number'
      ? `Question ${tossup.questionNumber}`
      : undefined,
  ].filter(Boolean) as string[];

  const handleRevealFullQuestion = () => {
    if (!tossup?.question || hasRevealedFullQuestion) {
      return;
    }
    clearAnimationTimeout();
    setHasRevealedFullQuestion(true);
    revealIndexRef.current = wordsRef.current.length;
    setDisplayedQuestion(tossup.question);
  };

  const answerResultColor = getResultColor(result, successColor, warningColor, errorColor, brandColor);
  const answerResultLabel = getResultLabel(result);
  const trimmedSubmittedAnswer = submittedAnswer?.trim();
  const shouldShowSubmittedAnswer =
    showAnswer &&
    normalizeDirective(result) === 'incorrect' &&
    Boolean(trimmedSubmittedAnswer);

  return (
    <ThemedView
      lightColor={Colors.light.surface}
      darkColor={Colors.dark.surface}
      style={[styles.container, questionOnly && styles.questionOnlyContainer, { borderColor }]}>
      {showMeta && !questionOnly ? (
        <>
          <View style={styles.metaHeader}>
            <ThemedText type="subtitle" style={styles.title}>
              {tossup?.setName ?? 'Random Tossup'}
            </ThemedText>
          </View>
          <View style={styles.metaChips}>
            {metaChips.map((chip, index) => (
              <View key={`${chip}-${index}`} style={[styles.chip, { borderColor }]}>
                <ThemedText style={styles.chipLabel}>{chip}</ThemedText>
              </View>
            ))}
          </View>
        </>
      ) : null}
      <View style={[styles.questionBlock, !questionOnly && styles.standardQuestionBlock, questionOnly && styles.questionOnlyBlock]}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator />
            {!questionOnly ? (
              <ThemedText style={{ color: mutedColor }}>Loading a tossup…</ThemedText>
            ) : null}
          </View>
        ) : error && !questionOnly ? (
          <ThemedText type="defaultSemiBold" style={[styles.error, { color: errorColor }]}>
            {error}
          </ThemedText>
        ) : (
          <ScrollView
            ref={questionScrollRef}
            style={styles.questionScroll}
            contentContainerStyle={[
              styles.questionScrollContent,
              questionOnly && styles.questionOnlyScrollContent,
              canShowRevealButton && styles.questionScrollWithButton,
              { paddingBottom: scrollPaddingBottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <ThemedText style={[styles.questionBody, questionOnly && styles.questionOnlyBody]}>
              {shouldAnimateQuestion
                ? displayedQuestion
                : tossup?.question ?? ''}
            </ThemedText>
            {showAnswer && questionOnly ? (
              <View style={[styles.questionOnlyAnswerBlock, { borderColor }]}>
                {answerResultLabel ? (
                  <ThemedText
                    type="defaultSemiBold"
                    style={[styles.questionOnlyResultLabel, { color: answerResultColor }]}>
                    {answerResultLabel}
                  </ThemedText>
                ) : null}
                {shouldShowSubmittedAnswer ? (
                  <View style={styles.submittedAnswerBlock}>
                    <ThemedText style={[styles.submittedAnswerLabel, { color: mutedColor }]}>
                      Your answer
                    </ThemedText>
                    <ThemedText type="defaultSemiBold" style={styles.submittedAnswerText}>
                      {trimmedSubmittedAnswer}
                    </ThemedText>
                  </View>
                ) : null}
                {shouldShowSubmittedAnswer ? (
                  <ThemedText style={[styles.submittedAnswerLabel, { color: mutedColor }]}>
                    Correct answer
                  </ThemedText>
                ) : null}
                <ThemedText style={styles.questionOnlyAnswerText}>
                  {tossup?.answer}
                </ThemedText>
              </View>
            ) : null}
            {showAnswer && !questionOnly ? (
              <View style={styles.answerBlock}>
                <View style={styles.answerHeader}>
                  <ThemedText type="subtitle" style={styles.answerLabel}>
                    Answer
                  </ThemedText>
                  {result ? (
                    <ThemedText
                      type="defaultSemiBold"
                      style={[
                        styles.answerResult,
                        { color: answerResultColor },
                      ]}>
                      {answerResultLabel}
                    </ThemedText>
                  ) : null}
                </View>
                {shouldShowSubmittedAnswer ? (
                  <View style={styles.submittedAnswerBlock}>
                    <ThemedText style={[styles.submittedAnswerLabel, { color: mutedColor }]}>
                      Your answer
                    </ThemedText>
                    <ThemedText type="defaultSemiBold" style={styles.submittedAnswerText}>
                      {trimmedSubmittedAnswer}
                    </ThemedText>
                  </View>
                ) : null}
                {shouldShowSubmittedAnswer ? (
                  <ThemedText style={[styles.submittedAnswerLabel, { color: mutedColor }]}>
                    Correct answer
                  </ThemedText>
                ) : null}
                <ThemedText type="defaultSemiBold">{tossup?.answer}</ThemedText>
              </View>
            ) : null}
          </ScrollView>
        )}
        {canShowRevealButton ? (
          <Pressable
            onPress={handleRevealFullQuestion}
            accessibilityRole="button"
            accessibilityLabel="Show full question"
            style={({ pressed }) => [
              styles.revealButton,
              {
                borderColor,
                backgroundColor: colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.05)',
                opacity: pressed ? 0.6 : 1,
              },
            ]}>
            <ThemedText style={[styles.revealLabel, { color: brandColor }]}>Show full question</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(24),
    padding: spacing.lg,
    gap: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(8) },
    shadowOpacity: 0.06,
    shadowRadius: scale(20),
    elevation: 2,
  },
  questionOnlyContainer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  metaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    fontSize: responsiveFont(16),
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
  },
  chipLabel: {
    fontSize: responsiveFont(11),
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  questionBlock: {
    flex: 1,
    position: 'relative',
  },
  standardQuestionBlock: {
    minHeight: verticalScale(240),
    maxHeight: verticalScale(360),
  },
  questionOnlyBlock: {
    minHeight: 0,
  },
  questionScroll: {
    flex: 1,
  },
  questionScrollContent: {
    paddingRight: scale(6),
  },
  questionOnlyScrollContent: {
    paddingRight: 0,
    paddingBottom: spacing.xl,
  },
  questionScrollWithButton: {
    paddingBottom: verticalScale(56),
  },
  questionBody: {
    fontSize: responsiveFont(17),
    lineHeight: verticalScale(26),
  },
  questionOnlyBody: {
    fontSize: responsiveFont(20),
    lineHeight: verticalScale(32),
    letterSpacing: 0.1,
  },
  loadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  answerBlock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  questionOnlyAnswerBlock: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  questionOnlyResultLabel: {
    fontSize: responsiveFont(17),
    letterSpacing: 0.2,
  },
  questionOnlyAnswerText: {
    fontSize: responsiveFont(17),
    lineHeight: verticalScale(25),
    opacity: 0.86,
  },
  submittedAnswerBlock: {
    gap: verticalScale(2),
  },
  submittedAnswerLabel: {
    fontSize: responsiveFont(12),
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  submittedAnswerText: {
    fontSize: responsiveFont(16),
    lineHeight: verticalScale(23),
  },
  answerLabel: {
    fontSize: responsiveFont(18),
  },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  answerResult: {
    fontSize: responsiveFont(16),
  },
  error: {},
  revealButton: {
    position: 'absolute',
    right: scale(10),
    bottom: scale(10),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(6),
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  revealLabel: {
    fontSize: responsiveFont(12),
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});

function getResultLabel(result?: AnswerResult): string {
  return result ? directiveLabel(result) : '';
}

function getResultColor(
  result: AnswerResult | undefined,
  successColor: string,
  warningColor: string,
  errorColor: string,
  brandColor: string
): string {
  const directive = normalizeDirective(result);
  if (directive === 'accept') {
    return successColor;
  }
  if (directive === 'prompt') {
    return warningColor;
  }
  if (directive === 'skip') {
    return brandColor;
  }
  return errorColor;
}
