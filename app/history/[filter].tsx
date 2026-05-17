import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SessionHistoryList } from '@/components/quiz/SessionHistoryList';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useQuizSession } from '@/hooks/useQuizSession';
import { normalizeDirective } from '@/utils/directives';
import { responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

type HistoryFilter = 'answered' | 'correct' | 'incorrect' | 'skipped';

const FILTER_METADATA: Record<HistoryFilter, { title: string }> = {
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

const HISTORY_FILTERS = new Set<HistoryFilter>([
  'answered',
  'correct',
  'incorrect',
  'skipped',
]);

function parseHistoryFilter(filter: string | string[] | undefined): HistoryFilter | null {
  const value = Array.isArray(filter) ? filter[0] : filter;
  return value && HISTORY_FILTERS.has(value as HistoryFilter)
    ? (value as HistoryFilter)
    : null;
}

export default function HistoryFilterScreen() {
  const router = useRouter();
  const { filter } = useLocalSearchParams<{ filter?: string | string[] }>();
  const activeFilter = parseHistoryFilter(filter);
  const colorScheme = useColorScheme();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const { history } = useQuizSession();

  useEffect(() => {
    if (!activeFilter) {
      router.replace('/(tabs)/history');
    }
  }, [activeFilter, router]);

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

  if (!activeFilter) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        <SessionHistoryList
          history={filteredHistory}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          groupByDirective={false}
          ListHeaderComponent={
            <View style={styles.detailHeader}>
              <Pressable
                onPress={() => router.back()}
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
  listContent: {
    padding: spacing.lg,
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
