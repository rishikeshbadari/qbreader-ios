import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SessionHistoryList } from '@/components/quiz/SessionHistoryList';
import { SessionStats, type SessionStatsCardKey } from '@/components/quiz/SessionStats';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useQuizSession } from '@/hooks/useQuizSession';
import { useSessionStats } from '@/hooks/useSessionStats';
import { normalizeDirective } from '@/utils/directives';
import { responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

type HistoryFilter = 'answered' | 'correct' | 'incorrect' | 'skipped';

const FILTER_METADATA: Record<
  HistoryFilter,
  { title: string; description: string }
> = {
  answered: {
    title: 'All answers',
    description: 'Every tossup you’ve heard this session.',
  },
  correct: {
    title: 'Correct answers',
    description: 'Tossups you nailed before hearing the full question.',
  },
  incorrect: {
    title: 'Incorrect answers',
    description: 'Responses that were marked incorrect or prompted.',
  },
  skipped: {
    title: 'Skipped',
    description: 'Tossups you chose to move on from.',
  },
};

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const { history } = useQuizSession();
  const stats = useSessionStats();
  const [activeFilter, setActiveFilter] = useState<HistoryFilter | null>(null);

  const filteredHistory = useMemo(() => {
    if (!activeFilter) {
      return [];
    }

    if (activeFilter === 'answered') {
      return history;
    }

    return history.filter((entry) => {
      const directive = normalizeDirective(entry.result);
      if (activeFilter === 'correct') {
        return directive === 'accept';
      }
      if (activeFilter === 'skipped') {
        return directive === 'skip';
      }
      return directive !== 'accept' && directive !== 'skip';
    });
  }, [activeFilter, history]);

  const handleSelectCard = (key: SessionStatsCardKey) => {
    if (key === 'streak') {
      return;
    }
    setActiveFilter(key);
  };

  const showList = Boolean(activeFilter);

  const header = (
    <View style={styles.header}>
      <ThemedText type="title">Answer log</ThemedText>
      <ThemedText style={styles.subtitle}>
        Every tossup you’ve attempted this session, with your response and the
        judged directive.
      </ThemedText>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        {showList && activeFilter ? (
          <SessionHistoryList
            history={filteredHistory}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            groupByDirective={false}
            ListHeaderComponent={
              <View style={styles.detailHeader}>
                <Pressable
                  onPress={() => setActiveFilter(null)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.backButton,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}>
                  <ThemedText style={styles.backLabel}>‹ Session stats</ThemedText>
                </Pressable>
                <ThemedText type="title">{FILTER_METADATA[activeFilter].title}</ThemedText>
                <ThemedText style={styles.subtitle}>
                  {FILTER_METADATA[activeFilter].description}
                </ThemedText>
              </View>
            }
          />
        ) : (
          <ScrollView contentContainerStyle={styles.statsContent}>
            {header}
            <SessionStats stats={stats} compact onSelectCard={handleSelectCard} />
            <ThemedText style={styles.helperText}>
              Tap a stat to review tossups from that category.
            </ThemedText>
          </ScrollView>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  statsContent: {
    padding: spacing.lg,
    gap: spacing.md + scale(2),
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.md,
  },
  subtitle: {
    marginTop: spacing.sm - scale(2),
    opacity: 0.8,
  },
  helperText: {
    opacity: 0.8,
  },
  detailHeader: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(4),
  },
  backLabel: {
    fontSize: responsiveFont(16),
  },
});
