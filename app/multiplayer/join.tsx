import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export default function JoinGameScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { joinGame } = useMultiplayer();
  const router = useRouter();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string>();

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');

  const handleJoin = async () => {
    if (isJoining || !code.trim()) return;

    setIsJoining(true);
    setError(undefined);

    try {
      await joinGame(code.trim(), name.trim() || 'Player');
      router.replace({ pathname: '/multiplayer/game', params: { sessionId: code.trim() } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join game.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <ThemedText type="title">Join a Game</ThemedText>
        <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
          Enter the game code shared by the host.
        </ThemedText>
      </View>

      <View style={styles.section}>
        <ThemedText type="subtitle" style={styles.label}>Your Name</ThemedText>
        <TextInput
          placeholder="Player"
          placeholderTextColor={mutedColor}
          style={[styles.input, { borderColor, color: textColor }]}
          value={name}
          onChangeText={setName}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="subtitle" style={styles.label}>Game Code</ThemedText>
        <TextInput
          placeholder="e.g. A1B2C3D4"
          placeholderTextColor={mutedColor}
          style={[styles.input, { borderColor, color: textColor }]}
          autoCapitalize="characters"
          value={code}
          onChangeText={setCode}
        />
      </View>

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      <Pressable
        onPress={handleJoin}
        disabled={isJoining || !code.trim()}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: brandColor, opacity: isJoining || !code.trim() ? 0.5 : pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>
          {isJoining ? 'Joining…' : 'Join Game'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  section: {
    gap: spacing.sm,
  },
  label: {
    fontSize: responsiveFont(16),
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(10),
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(12),
    fontSize: responsiveFont(16),
    minHeight: MIN_TOUCH_TARGET,
  },
  button: {
    borderRadius: scale(12),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    marginTop: spacing.sm,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: responsiveFont(16),
  },
  error: {
    color: '#DC2626',
    fontSize: responsiveFont(14),
  },
});
