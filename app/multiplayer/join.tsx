import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function JoinGameScreen() {
  const { joinSession } = useMultiplayer();
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string>();
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textOnBrand = '#fff';

  const handleJoin = async () => {
    if (isJoining || !code.trim()) {
      return;
    }
    setIsJoining(true);
    setError(undefined);
    try {
      await joinSession(code.trim(), name.trim() || 'Player');
      router.replace({ pathname: '/multiplayer/game', params: { sessionId: code.trim() } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join game.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Join a game</ThemedText>
      <View style={styles.field}>
        <ThemedText style={styles.label}>Your name</ThemedText>
        <TextInput
          placeholder="Player"
          placeholderTextColor={textOnBrand}
          selectionColor={textOnBrand}
          style={[
            styles.input,
            {
              borderColor,
              backgroundColor: brandColor,
              color: textOnBrand,
            },
          ]}
          value={name}
          onChangeText={setName}
        />
      </View>
      <View style={styles.field}>
        <ThemedText style={styles.label}>Game code</ThemedText>
        <TextInput
          style={[styles.input, { borderColor }]}
          placeholder="e.g. A1B2C3"
          placeholderTextColor="#94A3B8"
          autoCapitalize="characters"
          value={code}
          onChangeText={setCode}
        />
      </View>
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <Pressable
        onPress={handleJoin}
        disabled={isJoining}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: brandColor, opacity: isJoining ? 0.5 : pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>
          {isJoining ? 'Joining…' : 'Join game'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    opacity: 0.9,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: 'rgba(15, 23, 42, 0.02)',
  },
  button: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: '#fff',
    letterSpacing: 0.4,
  },
  error: {
    color: '#DC2626',
    marginTop: 4,
  },
});
