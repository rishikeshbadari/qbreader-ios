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
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

interface Props {
  tossup?: Tossup;
  isLoading: boolean;
  error?: string;
  showAnswer: boolean;
  isBuzzed?: boolean;
  result?: AnswerResult;
  revealActive?: boolean;
  onFullQuestionRevealChange?: (isRevealed: boolean) => void;
  onWordIndexChange?: (wordIndex: number) => void;
  revealSpeedOverride?: number;
  showRevealButton?: boolean;
  showMeta?: boolean;
}

export function QuestionCard({
  tossup,
  isLoading,
  error,
  showAnswer,
  isBuzzed = false,
  result,
  revealActive = true,
  onFullQuestionRevealChange,
  onWordIndexChange,
  revealSpeedOverride,
  showRevealButton = true,
  showMeta = true,
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
  const questionScrollRef = useRef<ScrollView | null>(null);
  const [hasRevealedFullQuestion, setHasRevealedFullQuestion] = useState(false);
  const wordsRef = useRef<string[]>([]);
  const revealIndexRef = useRef(0);
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
    shouldAnimateQuestion && revealActive && showRevealButton && !isBuzzed;

  useEffect(() => {
    setHasRevealedFullQuestion(false);
  }, [tossup?.id]);

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

    if (showAnswer || hasRevealedFullQuestion || revealIntervalMs === 0) {
      revealIndexRef.current = words.length;
      setDisplayedQuestion(questionText);
      onWordIndexChange?.(words.length);
      if ((showAnswer || revealIntervalMs === 0) && !hasRevealedFullQuestion) {
        setHasRevealedFullQuestion(true);
      }
      return;
    }

    if (shouldAnimateQuestion && words.length > 0) {
      revealIndexRef.current = 1;
      setDisplayedQuestion(words[0]);
      onWordIndexChange?.(1);
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
    hasRevealedFullQuestion,
    revealIntervalMs,
    shouldAnimateQuestion,
  ]);

  useEffect(() => {
    if (!isRevealRunning) {
      clearAnimationTimeout();
      return;
    }

    if (revealIndexRef.current >= wordsRef.current.length) {
      setHasRevealedFullQuestion((prev) => (prev ? prev : true));
      clearAnimationTimeout();
      return;
    }

    const revealNextWord = () => {
      const nextWord = wordsRef.current[revealIndexRef.current];
      if (typeof nextWord !== 'string') {
        return;
      }

      setDisplayedQuestion((previous) =>
        previous.length > 0 ? `${previous} ${nextWord}` : nextWord
      );
      revealIndexRef.current += 1;
      onWordIndexChange?.(revealIndexRef.current);

      if (revealIndexRef.current < wordsRef.current.length && !buzzedRef.current) {
        animationTimeout.current = setTimeout(revealNextWord, revealIntervalMs);
      } else if (revealIndexRef.current >= wordsRef.current.length) {
        setHasRevealedFullQuestion((prev) => (prev ? prev : true));
      }
    };

    revealNextWord();

    return () => {
      clearAnimationTimeout();
    };
  }, [isRevealRunning, tossup?.id, revealIntervalMs]);

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

  return (
    <ThemedView
      lightColor={Colors.light.surface}
      darkColor={Colors.dark.surface}
      style={[styles.container, { borderColor }]}>
      {showMeta ? (
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
      <View style={styles.questionBlock}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator />
            <ThemedText style={{ color: mutedColor }}>Loading a tossup…</ThemedText>
          </View>
        ) : error ? (
          <ThemedText type="defaultSemiBold" style={[styles.error, { color: errorColor }]}>
            {error}
          </ThemedText>
        ) : (
          <ScrollView
            ref={questionScrollRef}
            style={styles.questionScroll}
            contentContainerStyle={[
              styles.questionScrollContent,
              canShowRevealButton && styles.questionScrollWithButton,
              { paddingBottom: scrollPaddingBottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.questionBody}>
              {shouldAnimateQuestion
                ? displayedQuestion
                : tossup?.question ?? ''}
            </ThemedText>
            {showAnswer ? (
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
                        { color: getResultColor(result, successColor, warningColor, errorColor, brandColor) },
                      ]}>
                      {getResultLabel(result)}
                    </ThemedText>
                  ) : null}
                </View>
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
    borderWidth: scale(1),
    borderRadius: scale(24),
    padding: spacing.lg,
    gap: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: scale(10) },
    shadowOpacity: 0.08,
    shadowRadius: scale(25),
    elevation: 4,
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
    borderWidth: scale(1),
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
    minHeight: verticalScale(240),
    maxHeight: verticalScale(360),
    position: 'relative',
  },
  questionScroll: {
    flex: 1,
  },
  questionScrollContent: {
    paddingRight: scale(6),
  },
  questionScrollWithButton: {
    paddingBottom: verticalScale(56),
  },
  questionBody: {
    fontSize: responsiveFont(17),
    lineHeight: verticalScale(26),
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

function getRevealIntervalMs(revealSpeed: number): number {
  const clamped = Math.min(1, Math.max(0, revealSpeed));
  if (clamped >= 0.99) {
    return 0;
  }
  const slowestMs = 650;
  const fastestMs = 80;
  return Math.round(slowestMs - (slowestMs - fastestMs) * clamped);
}
