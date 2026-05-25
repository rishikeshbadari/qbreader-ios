import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { GameSummary } from '@/types/multiplayer';
import { parseMatchHistory, prependMatchHistory } from '@/utils/matchHistory';
import { responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

const HISTORY_KEY = 'quizbowl:match_history';

export async function saveMatchToHistory(summary: GameSummary): Promise<void> {
  const existing = await loadMatchHistory();
  const updated = prependMatchHistory(existing, summary);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

export async function loadMatchHistory(): Promise<GameSummary[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return parseMatchHistory(raw);
  } catch {
    return [];
  }
}

export default function MatchHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [matches, setMatches] = useState<GameSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const borderColor = useThemeColor({}, 'border');
  const mutedColor = useThemeColor({}, 'muted');

  useEffect(() => {
    loadMatchHistory().then(data => {
      setMatches(data);
      setIsLoading(false);
    });
  }, []);

  const formatDate = useCallback((timestamp: number | undefined) => {
    if (!timestamp) return 'Unknown date';
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, []);

  const renderMatch = useCallback(({ item }: { item: GameSummary }) => {
    const playerNames = item.players.map(p => p.name).join(', ');
    const questionCount = item.questions.length;

    return (
      <View style={[styles.matchCard, { borderColor }]}>
        <ThemedText style={styles.matchDate}>{formatDate(item.endedAt)}</ThemedText>
        <ThemedText style={styles.matchPlayers} numberOfLines={1}>
          {playerNames}
        </ThemedText>
        <ThemedText style={[styles.matchDetail, { color: mutedColor }]}>
          {questionCount} question{questionCount !== 1 ? 's' : ''}
        </ThemedText>
      </View>
    );
  }, [borderColor, mutedColor, formatDate]);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}>
          <ThemedText style={styles.backLabel}>&#8249; Back</ThemedText>
        </Pressable>
        <ThemedText type="title">Match History</ThemedText>
      </View>

      {isLoading ? (
        <View style={styles.emptyState}>
          <ThemedText style={[styles.emptyText, { color: mutedColor }]}>Loading...</ThemedText>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.emptyState}>
          <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
            No matches played yet.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item, i) => `${item.sessionId}-${i}`}
          renderItem={renderMatch}
          contentContainerStyle={styles.listContent}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: verticalScale(4),
  },
  backLabel: {
    fontSize: responsiveFont(16),
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: responsiveFont(15),
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  matchCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(12),
    padding: spacing.md,
    gap: spacing.xs,
  },
  matchDate: {
    fontSize: responsiveFont(12),
    fontWeight: '600',
  },
  matchPlayers: {
    fontSize: responsiveFont(15),
    fontWeight: '500',
  },
  matchDetail: {
    fontSize: responsiveFont(13),
  },
});
