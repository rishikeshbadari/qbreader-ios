import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { Tossup } from '@/types/qb';

interface Props {
  tossup?: Tossup;
  isLoading: boolean;
  error?: string;
  showAnswer: boolean;
  isBuzzed?: boolean;
}

const WORD_REVEAL_INTERVAL_MS = 320;

export function QuestionCard({
  tossup,
  isLoading,
  error,
  showAnswer,
  isBuzzed = false,
}: Props) {
  const borderColor = useThemeColor({}, 'border');
  const mutedColor = useThemeColor({}, 'muted');
  const [displayedQuestion, setDisplayedQuestion] = useState('');
  const animationTimeout = useRef<NodeJS.Timeout | null>(null);
  const buzzedRef = useRef(isBuzzed);
  const shouldAnimateQuestion =
    Boolean(tossup?.question) && !isLoading && !error && !showAnswer;

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

    if (showAnswer) {
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
      setDisplayedQuestion((previous) =>
        previous.length > 0 ? `${previous} ${words[index]}` : words[index]
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
  }, [tossup?.id, tossup?.question, isLoading, error, showAnswer]);

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
          <ThemedText style={styles.questionBody}>
            {shouldAnimateQuestion
              ? displayedQuestion || '…'
              : tossup?.question ??
                'Tap “Next Tossup” to start practicing with a random clue.'}
          </ThemedText>
        )}
      </View>
      {showAnswer && (
        <View style={styles.answerBlock}>
          <ThemedText type="subtitle" style={styles.answerLabel}>
            Answer
          </ThemedText>
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
    minHeight: 120,
    justifyContent: 'center',
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
  error: {
    color: '#DC2626',
  },
});
