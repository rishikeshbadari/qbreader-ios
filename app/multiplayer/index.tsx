import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export default function MultiplayerHome() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const mutedColor = useThemeColor({}, 'muted');
  const textColor = useThemeColor({}, 'text');

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.content}>
        <View style={styles.header}>
        <ThemedText type="title">Multiplayer</ThemedText>
        <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
          Play locally over Wi-Fi or Bluetooth with friends nearby.
        </ThemedText>
      </View>

      <View style={styles.actions}>
        <Link href="/multiplayer/host" asChild>
          <Pressable style={({ pressed }) => [
            styles.button,
            { backgroundColor: brandColor, opacity: pressed ? 0.8 : 1 },
          ]}>
            <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>
              Start a Game
            </ThemedText>
          </Pressable>
        </Link>

        <Link href="/multiplayer/join" asChild>
          <Pressable style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            { borderColor, opacity: pressed ? 0.8 : 1 },
          ]}>
            <ThemedText type="defaultSemiBold" style={[styles.buttonLabel, { color: textColor }]}>
              Join a Game
            </ThemedText>
          </Pressable>
        </Link>
      </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  header: {
    gap: spacing.sm,
  },
  subtitle: {
    fontSize: responsiveFont(15),
  },
  actions: {
    gap: spacing.md,
  },
  button: {
    borderRadius: scale(12),
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: responsiveFont(16),
  },
});
