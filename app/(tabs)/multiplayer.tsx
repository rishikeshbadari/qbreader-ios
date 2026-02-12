import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export default function MultiplayerTab() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const mutedColor = useThemeColor({}, 'muted');

  const actions = [
    {
      title: 'Start a Game',
      description: 'Host a new game and invite nearby players.',
      href: '/multiplayer/host' as const,
      primary: true,
    },
    {
      title: 'Join a Game',
      description: 'Enter a game code to join an existing session.',
      href: '/multiplayer/join' as const,
    },
    {
      title: 'Last Game Summary',
      description: 'Review results from your most recent game.',
      href: '/multiplayer/summary' as const,
    },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="title">Multiplayer</ThemedText>
          <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
            Play locally over Wi-Fi or Bluetooth. Start a game or join one nearby.
          </ThemedText>
        </View>
        <View style={styles.actions}>
          {actions.map((action) => (
            <Pressable
              key={action.href}
              onPress={() => router.push(action.href)}
              accessibilityRole="button"
              accessibilityLabel={action.title}
              style={({ pressed }) => [
                styles.actionCard,
                {
                  borderColor,
                  backgroundColor: action.primary ? brandColor : undefined,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText
                type="defaultSemiBold"
                style={[
                  styles.actionTitle,
                  action.primary && styles.primaryText,
                ]}>
                {action.title}
              </ThemedText>
              <ThemedText
                style={[
                  styles.actionDescription,
                  action.primary ? styles.primaryTextMuted : { color: mutedColor },
                ]}>
                {action.description}
              </ThemedText>
            </Pressable>
          ))}
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
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  subtitle: {
    fontSize: responsiveFont(14),
  },
  actions: {
    gap: spacing.md,
  },
  actionCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(16),
    padding: spacing.lg,
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
  },
  actionTitle: {
    fontSize: responsiveFont(16),
  },
  actionDescription: {
    fontSize: responsiveFont(13),
  },
  primaryText: {
    color: '#fff',
  },
  primaryTextMuted: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
});
