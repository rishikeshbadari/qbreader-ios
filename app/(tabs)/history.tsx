import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SessionStats, type SessionStatsCardKey } from '@/components/quiz/SessionStats';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useSessionStats } from '@/hooks/useSessionStats';
import { scale, spacing } from '@/utils/responsive';

export default function HistoryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const tabBarHeight = useBottomTabBarHeight();
  const stats = useSessionStats();

  const handleSelectCard = (key: SessionStatsCardKey) => {
    router.push({
      pathname: '/history/[filter]',
      params: { filter: key },
    });
  };

  const header = (
    <View style={styles.header}>
      <ThemedText type="title">History</ThemedText>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={[styles.statsContent, { paddingBottom: tabBarHeight + spacing.lg }]}>
          {header}
          <SessionStats stats={stats} compact onSelectCard={handleSelectCard} />
        </ScrollView>
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
  statsContent: {
    padding: spacing.lg,
    gap: spacing.md + scale(2),
  },
  header: {
    gap: spacing.md,
  },
});
