import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

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
    padding: 20,
    gap: 16,
    justifyContent: 'center',
  },
  subtitle: {
    opacity: 0.8,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  actionLink: {
    paddingVertical: 14,
  },
});
