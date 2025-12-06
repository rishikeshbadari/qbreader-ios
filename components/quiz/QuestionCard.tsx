import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { AnswerResult, Tossup } from '@/types/qb';

interface Props {
  tossup?: Tossup;
  isLoading: boolean;
  error?: string;
  showAnswer: boolean;
  isBuzzed?: boolean;
  result?: AnswerResult;
}

const WORD_REVEAL_INTERVAL_MS = 320;

export function QuestionCard({
  tossup,
  isLoading,
  error,
  showAnswer,
  isBuzzed = false,
  result,
}: Props) {
  const borderColor = useThemeColor({}, 'border');
  const mutedColor = useThemeColor({}, 'muted');
  const successColor = useThemeColor({}, 'success');
  const warningColor = useThemeColor({}, 'warning');
  const errorColor = useThemeColor({}, 'error');
  const brandColor = useThemeColor({}, 'brand');
  const [displayedQuestion, setDisplayedQuestion] = useState('');
  const animationTimeout = useRef<NodeJS.Timeout | null>(null);
  const buzzedRef = useRef(isBuzzed);
  const questionScrollRef = useRef<ScrollView | null>(null);
  const [hasRevealedFullQuestion, setHasRevealedFullQuestion] = useState(false);
  const shouldAnimateQuestion =
    Boolean(tossup?.question) && !isLoading && !error && !showAnswer && !hasRevealedFullQuestion;
  const canShowRevealButton =
    Boolean(tossup?.question) && !isLoading && !error && !showAnswer && !hasRevealedFullQuestion;

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
      setDisplayedQuestion('');
      return;
    }

    if (showAnswer || hasRevealedFullQuestion) {
      setDisplayedQuestion(questionText);
      return;
    }

    const words = questionText.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      setDisplayedQuestion(questionText);
      return;
    }

    let index = 0;
    setDisplayedQuestion('');

    const revealNextWord = () => {
      const nextWord = words[index];
      if (typeof nextWord !== 'string') {
        setDisplayedQuestion((previous) => previous);
        return;
      }

      setDisplayedQuestion((previous) =>
        previous.length > 0 ? `${previous} ${nextWord}` : nextWord
      );
      index += 1;

      if (index < words.length && !buzzedRef.current) {
        animationTimeout.current = setTimeout(revealNextWord, WORD_REVEAL_INTERVAL_MS);
      }
    };

    revealNextWord();

    return () => {
      clearAnimationTimeout();
    };
  }, [tossup?.id, tossup?.question, isLoading, error, showAnswer, hasRevealedFullQuestion]);

  useEffect(() => {
    if (!questionScrollRef.current) {
      return;
    }

    if (shouldAnimateQuestion) {
      questionScrollRef.current.scrollToEnd({ animated: true });
    } else {
      questionScrollRef.current.scrollTo({ y: 0, animated: false });
    }
  }, [displayedQuestion, shouldAnimateQuestion]);

  const metaChips = [
    tossup?.category,
    tossup?.subcategory,
    tossup?.difficulty ? `Difficulty ${tossup.difficulty}` : undefined,
    typeof tossup?.packetNumber === 'number'
      ? `Packet ${tossup.packetNumber}`
      : undefined,
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
    setDisplayedQuestion(tossup.question);
  };

  return (
    <ThemedView
      lightColor={Colors.light.surface}
      darkColor={Colors.dark.surface}
      style={[styles.container, { borderColor }]}>
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
      <View style={styles.questionBlock}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator />
            <ThemedText style={{ color: mutedColor }}>Loading a tossup…</ThemedText>
          </View>
        ) : error ? (
          <ThemedText type="defaultSemiBold" style={styles.error}>
            {error}
          </ThemedText>
        ) : (
          <ScrollView
            ref={questionScrollRef}
            style={styles.questionScroll}
            contentContainerStyle={styles.questionScrollContent}
            showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.questionBody}>
              {shouldAnimateQuestion
                ? displayedQuestion || '…'
                : tossup?.question ??
                  'Tap “Next Tossup” to start practicing with a random clue.'}
            </ThemedText>
          </ScrollView>
        )}
        {canShowRevealButton ? (
          <Pressable
            onPress={handleRevealFullQuestion}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.revealButton,
              {
                borderColor,
                opacity: pressed ? 0.6 : 1,
              },
            ]}>
            <ThemedText style={[styles.revealLabel, { color: brandColor }]}>Show full question</ThemedText>
          </Pressable>
        ) : null}
      </View>
      {showAnswer && (
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
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 25,
    elevation: 4,
  },
  metaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipLabel: {
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  questionBlock: {
    height: 300,
    position: 'relative',
  },
  questionScroll: {
    flex: 1,
  },
  questionScrollContent: {
    paddingRight: 6,
  },
  questionBody: {
    fontSize: 17,
    lineHeight: 26,
  },
  loadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  answerBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 4,
  },
  answerLabel: {
    fontSize: 18,
  },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  answerResult: {
    fontSize: 16,
  },
  error: {
    color: '#DC2626',
  },
  revealButton: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
  },
  revealLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});

function getResultLabel(result?: AnswerResult): string {
  if (!result) {
    return '';
  }

  const directive = result.directive.toLowerCase();
  if (directive === 'accept') {
    return 'Correct';
  }
  if (directive === 'prompt') {
    return 'Prompt';
  }
  if (directive === 'skip') {
    return 'Skipped';
  }
  return 'Incorrect';
}

function getResultColor(
  result: AnswerResult | undefined,
  successColor: string,
  warningColor: string,
  errorColor: string,
  brandColor: string
): string {
  if (!result) {
    return brandColor;
  }

  const directive = result.directive.toLowerCase();
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
