import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
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
  { title: string }
> = {
  answered: {
    title: 'All answers',
  },
  correct: {
    title: 'Correct answers',
  },
  incorrect: {
    title: 'Incorrect answers',
  },
  skipped: {
    title: 'Skipped',
  },
};

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const tabBarHeight = useBottomTabBarHeight();
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
      <ThemedText type="title">History</ThemedText>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        {showList && activeFilter ? (
          <SessionHistoryList
            history={filteredHistory}
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + spacing.lg }]}
            groupByDirective={false}
            ListHeaderComponent={
              <View style={styles.detailHeader}>
                <Pressable
                  onPress={() => setActiveFilter(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Back to session stats"
                  testID="history-back"
                  style={({ pressed }) => [
                    styles.backButton,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}>
                  <ThemedText style={styles.backLabel}>‹ Session stats</ThemedText>
                </Pressable>
                <ThemedText type="title">{FILTER_METADATA[activeFilter].title}</ThemedText>
              </View>
            }
          />
        ) : (
          <ScrollView contentContainerStyle={[styles.statsContent, { paddingBottom: tabBarHeight + spacing.lg }]}>
            {header}
            <SessionStats stats={stats} compact onSelectCard={handleSelectCard} />
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
