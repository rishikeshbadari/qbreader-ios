import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { spacing } from '@/utils/responsive';

export default function MultiplayerTab() {
  const colorScheme = useColorScheme();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Multiplayer</ThemedText>
        <ThemedText style={styles.subtitle}>
          Play locally over Wi‑Fi/Bluetooth. Start a game or join one nearby.
        </ThemedText>
        <View style={styles.actions}>
          <Link href="/multiplayer/host" style={styles.actionLink}>
            <ThemedText type="defaultSemiBold">Start a game</ThemedText>
          </Link>
          <Link href="/multiplayer/join" style={styles.actionLink}>
            <ThemedText type="defaultSemiBold">Join a game</ThemedText>
          </Link>
          <Link href="/multiplayer/summary" style={styles.actionLink}>
            <ThemedText type="defaultSemiBold">View last game summary</ThemedText>
          </Link>
        </View>
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
    padding: spacing.lg,
    gap: spacing.md,
  },
  subtitle: {
    opacity: 0.8,
  },
  actions: {
    gap: spacing.md - spacing.xs,
    marginTop: spacing.sm,
  },
  actionLink: {
    paddingVertical: spacing.md + spacing.xs,
    minHeight: spacing.lg,
  },
});
