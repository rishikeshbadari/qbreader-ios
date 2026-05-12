import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
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
  const tabBarHeight = useBottomTabBarHeight();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const mutedColor = useThemeColor({}, 'muted');
  const surfaceColor = useThemeColor({}, 'surface');

  const actions = [
    {
      title: 'Start a Game',
      description: 'Host a new game and invite nearby players.',
      href: '/multiplayer/host' as const,
      primary: true,
    },
    {
      title: 'Join a Game',
      description: 'Find and join a nearby game.',
      href: '/multiplayer/join' as const,
    },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ThemedView style={[styles.container, { paddingBottom: tabBarHeight + spacing.md }]}>
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
                  backgroundColor: action.primary ? brandColor : surfaceColor,
                  opacity: pressed ? 0.85 : 1,
                },
                action.primary && styles.primaryCard,
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
        <Pressable
          onPress={() => router.push('/multiplayer/rules')}
          accessibilityRole="button"
          accessibilityLabel="How to Play"
          style={({ pressed }) => [
            styles.rulesLink,
            { borderColor, backgroundColor: surfaceColor, opacity: pressed ? 0.7 : 1 },
          ]}>
          <ThemedText style={[styles.rulesLinkText, { color: brandColor }]}>
            How to Play
          </ThemedText>
        </Pressable>
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
    borderRadius: scale(20),
    padding: spacing.lg,
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
  },
  primaryCard: {
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: verticalScale(8) },
    shadowOpacity: 0.18,
    shadowRadius: scale(18),
    elevation: 3,
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
  rulesLink: {
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: verticalScale(9),
  },
  rulesLinkText: {
    fontSize: responsiveFont(15),
    fontWeight: '600',
  },
});
