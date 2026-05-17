import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SCORING, type GameSummary } from '@/types/multiplayer';
import type { AnswerResult } from '@/types/qb';
import { normalizeDirective } from '@/utils/directives';
import { saveMatchToHistory } from '@/app/multiplayer/history';
import { responsiveFont, scale, spacing, verticalScale, MIN_TOUCH_TARGET } from '@/utils/responsive';

const SUMMARY_EXIT_RESET_DELAY_MS = 450;

type PlayerScore = {
  id: string;
  name: string;
  status: 'active' | 'left';
  correct: number;
  incorrect: number;
  powers: number;
  points: number;
  accuracy: number;
};

function computeScores(summary: GameSummary): PlayerScore[] {
  const scores = new Map<string, { correct: number; incorrect: number; powers: number; points: number }>();
  for (const player of summary.players) {
    scores.set(player.id, { correct: 0, incorrect: 0, powers: 0, points: 0 });
  }
  for (const record of summary.questions) {
    for (const buzz of record.buzzes) {
      const entry = scores.get(buzz.playerId);
      if (!entry) continue;
      const directive = normalizeDirective(buzz.result);
      if (directive === 'accept') {
        entry.correct += 1;
        if (buzz.isPower) {
          entry.powers += 1;
          entry.points += SCORING.POWER;
        } else {
          entry.points += SCORING.CORRECT;
        }
      } else if (directive === 'incorrect') {
        entry.incorrect += 1;
        entry.points += SCORING.INCORRECT;
      }
    }
  }
  return summary.players
    .map((p) => {
      const s = scores.get(p.id)!;
      const total = s.correct + s.incorrect;
      return {
        id: p.id,
        name: p.name,
        status: (p.status ?? 'active') as 'active' | 'left',
        ...s,
        accuracy: total > 0 ? s.correct / total : 0,
      };
    })
    .sort((a, b) => b.points - a.points);
}

function buzzPointDelta(buzz: { result?: AnswerResult; isPower?: boolean }): number {
  const directive = normalizeDirective(buzz.result);
  if (directive === 'accept') return buzz.isPower ? SCORING.POWER : SCORING.CORRECT;
  if (directive === 'incorrect') return SCORING.INCORRECT;
  return 0;
}

function buzzLabel(buzz: { isPower?: boolean; timedOut?: boolean }): string | null {
  if (buzz.isPower) return 'POWER';
  if (buzz.timedOut) return 'TIMEOUT';
  return null;
}

export default function MultiplayerSummaryScreen() {
  const insets = useSafeAreaInsets();
  const { summary, completeForcedExit } = useMultiplayer();
  const router = useRouter();

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const successColor = useThemeColor({}, 'success');
  const errorColor = useThemeColor({}, 'error');

  const exitHandledRef = useRef(false);
  const handleDone = () => {
    if (exitHandledRef.current) return;

    exitHandledRef.current = true;
    router.dismissTo('/(tabs)/multiplayer');
    setTimeout(completeForcedExit, SUMMARY_EXIT_RESET_DELAY_MS);
  };
  const playerNames = summary?.players.map(p => p.name).join(', ') ?? '';
  const scores = useMemo(() => summary ? computeScores(summary) : [], [summary]);

  // Auto-save to match history
  const savedRef = useRef(false);
  useEffect(() => {
    if (summary && !savedRef.current) {
      savedRef.current = true;
      saveMatchToHistory(summary).catch(() => {});
    }
  }, [summary]);

  if (!summary) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
        <ThemedText type="title">No Game Data</ThemedText>
          <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
            There is no game summary to display.
          </ThemedText>
          <Pressable
            onPress={handleDone}
            style={[styles.button, { backgroundColor: brandColor }]}>
            <ThemedText style={styles.buttonLabel}>Back to Multiplayer</ThemedText>
          </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.header}>
        <Pressable
          onPress={handleDone}
          accessibilityRole="button"
          accessibilityLabel="Back to multiplayer"
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}>
          <ThemedText style={styles.backLabel}>‹ Back</ThemedText>
        </Pressable>
        <ThemedText type="title">Game Summary</ThemedText>
        <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
          Players: {playerNames}
        </ThemedText>
      </View>

      {/* Scoreboard */}
      <View style={[styles.scoreboard, { borderColor }]}>
        {scores.map((score, idx) => (
          <View key={score.id} style={styles.scoreRow}>
            <View style={styles.scoreRank}>
              <ThemedText type="defaultSemiBold" style={styles.scoreRankText}>
                {idx + 1}
              </ThemedText>
            </View>
            <View style={styles.scoreInfo}>
              <View style={styles.nameRow}>
                <ThemedText type="defaultSemiBold">{score.name}</ThemedText>
                {score.status === 'left' ? (
                  <ThemedText style={[styles.leftBadge, { color: mutedColor }]}>(left)</ThemedText>
                ) : null}
              </View>
              <ThemedText style={[styles.scoreDetail, { color: mutedColor }]}>
                {score.correct} correct{score.powers > 0 ? ` (${score.powers} powers)` : ''} · {score.incorrect} wrong · {Math.round(score.accuracy * 100)}%
              </ThemedText>
            </View>
            <ThemedText
              type="defaultSemiBold"
              style={[styles.scoreValue, { color: score.points >= 0 ? successColor : errorColor }]}>
              {score.points}
            </ThemedText>
          </View>
        ))}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {summary.questions.length === 0 ? (
          <ThemedText style={[styles.empty, { color: mutedColor }]}>No questions played.</ThemedText>
        ) : (
          summary.questions.map((record, idx) => (
            <View key={record.question.id ?? idx} style={[styles.card, { borderColor }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold">Question {idx + 1}</ThemedText>
                <ThemedText style={[styles.setName, { color: mutedColor }]}>
                  {record.question.setName ?? 'Random'}
                </ThemedText>
              </View>

              <ThemedText style={styles.questionText} numberOfLines={3}>
                {record.question.question}
              </ThemedText>

              <View style={styles.answerRow}>
                <ThemedText style={[styles.answerLabel, { color: mutedColor }]}>Answer:</ThemedText>
                <ThemedText type="defaultSemiBold" style={{ color: textColor }}>
                  {record.question.answer}
                </ThemedText>
              </View>

              {record.buzzes.length > 0 && (
                <View style={styles.buzzes}>
                  {record.buzzes.map((buzz, buzzIdx) => {
                    const player = summary.players.find(p => p.id === buzz.playerId);
                    const directive = normalizeDirective(buzz.result);
                    const isCorrect = directive === 'accept';
                    const delta = buzzPointDelta(buzz);
                    const label = buzzLabel(buzz);
                    return (
                      <View key={buzzIdx} style={styles.buzzRow}>
                        <ThemedText style={{ color: textColor }}>
                          {player?.name ?? 'Unknown'}:
                        </ThemedText>
                        <ThemedText style={{ color: isCorrect ? successColor : errorColor }}>
                          {directive ?? 'pending'}
                        </ThemedText>
                        {label ? (
                          <ThemedText style={[styles.buzzLabel, { color: isCorrect ? successColor : errorColor }]}>
                            {label}
                          </ThemedText>
                        ) : null}
                        {delta !== 0 ? (
                          <ThemedText style={[styles.buzzDelta, { color: delta > 0 ? successColor : errorColor }]}>
                            {delta > 0 ? `+${delta}` : `${delta}`}
                          </ThemedText>
                        ) : null}
                        <ThemedText style={[styles.buzzAnswer, { color: mutedColor }]}>
                          {buzz.answer ? `“${buzz.answer}”` : '(no answer)'}
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={handleDone}
        accessibilityRole="button"
        accessibilityLabel="Done with summary"
        testID="summary-done-button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: brandColor, opacity: pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>Done</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: verticalScale(4),
  },
  backLabel: {
    fontSize: responsiveFont(16),
  },
  subtitle: {
    fontSize: responsiveFont(14),
  },
  scoreboard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(16),
    padding: spacing.md,
    gap: spacing.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  scoreRank: {
    width: scale(24),
    alignItems: 'center',
  },
  scoreRankText: {
    fontSize: responsiveFont(14),
  },
  scoreInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  leftBadge: {
    fontSize: responsiveFont(11),
    fontStyle: 'italic',
  },
  scoreDetail: {
    fontSize: responsiveFont(12),
  },
  scoreValue: {
    fontSize: responsiveFont(20),
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  empty: {
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(12),
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  setName: {
    fontSize: responsiveFont(12),
  },
  questionText: {
    fontSize: responsiveFont(14),
    lineHeight: responsiveFont(20),
  },
  answerRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  answerLabel: {
    fontSize: responsiveFont(14),
  },
  buzzes: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  buzzRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  buzzLabel: {
    fontSize: responsiveFont(11),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  buzzDelta: {
    fontSize: responsiveFont(12),
    fontWeight: '600',
  },
  buzzAnswer: {
    fontSize: responsiveFont(13),
    fontStyle: 'italic',
  },
  button: {
    borderRadius: scale(12),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: responsiveFont(16),
  },
});
