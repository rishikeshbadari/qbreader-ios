import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export default function JoinGameScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { joinGame } = useMultiplayer();
  const { code: deepLinkCode } = useLocalSearchParams<{ code?: string }>();

  const [name, setName] = useState('');
  const [gameCode, setGameCode] = useState(deepLinkCode?.toUpperCase() ?? '');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string>();

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const errorColor = useThemeColor({}, 'error');

  const handleJoin = async () => {
    const trimmedCode = gameCode.trim().toUpperCase();
    if (!trimmedCode) {
      setError('Please enter a game code.');
      return;
    }
    if (trimmedCode.length < 6) {
      setError('Game code must be 6 characters.');
      return;
    }

    setIsJoining(true);
    setError(undefined);

    try {
      await joinGame(trimmedCode, name.trim() || 'Player');
      router.replace({ pathname: '/multiplayer/lobby', params: { code: trimmedCode } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to join game.';
      if (message.includes('not found')) {
        setError('Game code not found. Check the code or ask the host for a new link.');
      } else if (message.includes('full')) {
        setError('Game is full (10/10 players). Try another game.');
      } else {
        setError(message);
      }
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}>
              <ThemedText style={styles.backLabel}>&#8249; Back</ThemedText>
            </Pressable>
            <ThemedText type="title">Join a Game</ThemedText>
            <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
              Enter the game code from the host to join.
            </ThemedText>
          </View>

          {/* Name input */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Your Name</ThemedText>
            <TextInput
              placeholder="Player"
              placeholderTextColor={mutedColor}
              style={[styles.input, { borderColor, color: textColor }]}
              value={name}
              onChangeText={setName}
              returnKeyType="next"
            />
          </View>

          {/* Game code input */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Game Code</ThemedText>
            <TextInput
              placeholder="ABC123"
              placeholderTextColor={mutedColor}
              style={[styles.codeInput, { borderColor, color: textColor }]}
              value={gameCode}
              onChangeText={(text) => setGameCode(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              autoCapitalize="characters"
              maxLength={6}
              returnKeyType="go"
              onSubmitEditing={handleJoin}
            />
          </View>

          {error && <ThemedText style={[styles.error, { color: errorColor }]}>{error}</ThemedText>}
        </View>

        {/* Join button */}
        <Pressable
          onPress={handleJoin}
          disabled={isJoining || gameCode.length < 6}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: brandColor,
              opacity: isJoining || gameCode.length < 6 ? 0.5 : pressed ? 0.8 : 1,
            },
          ]}>
          <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>
            {isJoining ? 'Joining...' : 'Join Game'}
          </ThemedText>
        </Pressable>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: verticalScale(4),
  },
  backLabel: {
    fontSize: responsiveFont(16),
  },
  subtitle: {
    fontSize: responsiveFont(14),
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
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
  codeInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(10),
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(16),
    fontSize: responsiveFont(28),
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  error: {
    fontSize: responsiveFont(14),
  },
  button: {
    margin: spacing.lg,
    borderRadius: scale(12),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: responsiveFont(16),
  },
});
