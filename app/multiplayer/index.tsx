import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { spacing } from '@/utils/responsive';

export default function MultiplayerHome() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Multiplayer</ThemedText>
      <ThemedText style={styles.subtitle}>
        Play locally over Wi-Fi/Bluetooth. Start a game or join one nearby.
      </ThemedText>
      <View style={styles.actions}>
        <Link href="/multiplayer/host" style={styles.actionLink}>
          <ThemedText type="defaultSemiBold">Start a game</ThemedText>
        </Link>
        <Link href="/multiplayer/join" style={styles.actionLink}>
          <ThemedText type="defaultSemiBold">Join a game</ThemedText>
        </Link>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
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
