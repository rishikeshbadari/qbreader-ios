import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useNearbyGames } from '@/hooks/useNearbyGames';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { DiscoveredSession } from '@/services/multiplayer/transport';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

const MARQUEE_SPEED = 30; // pixels per second

/**
 * Horizontally scrolling player name chips.
 * If all chips fit, they sit still. Otherwise they auto-scroll in a loop.
 */
function PlayerMarquee({ players, chipColor, textColor }: {
  players: string[];
  chipColor: string;
  textColor: string;
}) {
  const contentWidth = useRef(0);
  const containerWidth = useRef(0);
  const animValue = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const startMarquee = useCallback(() => {
    const overflow = contentWidth.current - containerWidth.current;
    if (overflow <= 0) return;

    const duration = (overflow / MARQUEE_SPEED) * 1000;
    animValue.setValue(0);
    animRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(animValue, {
          toValue: -overflow,
          duration,
          useNativeDriver: true,
        }),
        Animated.delay(1500),
        Animated.timing(animValue, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
        Animated.delay(1500),
      ]),
    );
    animRef.current.start();
  }, [animValue]);

  useEffect(() => {
    return () => { animRef.current?.stop(); };
  }, []);

  const onContainerLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    containerWidth.current = e.nativeEvent.layout.width;
    animRef.current?.stop();
    startMarquee();
  };

  const onContentLayout = (w: number) => {
    contentWidth.current = w;
    animRef.current?.stop();
    startMarquee();
  };

  return (
    <View style={styles.marqueeContainer} onLayout={onContainerLayout}>
      <Animated.View
        style={[styles.marqueeInner, { transform: [{ translateX: animValue }] }]}
        onLayout={(e) => onContentLayout(e.nativeEvent.layout.width)}
      >
        {players.map((name, i) => (
          <View key={i} style={[styles.chip, { backgroundColor: chipColor }]}>
            <ThemedText style={[styles.chipText, { color: textColor }]}>{name}</ThemedText>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

export default function JoinGameScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { joinGame } = useMultiplayer();
  const { sessions, isSearching } = useNearbyGames();
  const router = useRouter();

  const [name, setName] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const errorColor = useThemeColor({}, 'error');
  const chipBg = colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';

  const handleJoin = async (session: DiscoveredSession) => {
    if (joiningId) return;
    setJoiningId(session.sessionId);
    setError(undefined);

    try {
      await joinGame(session.sessionId, name.trim() || 'Player');
      router.replace({ pathname: '/multiplayer/game', params: { sessionId: session.sessionId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join game.');
      setJoiningId(null);
    }
  };

  const renderSession = ({ item }: { item: DiscoveredSession }) => {
    const isJoiningThis = joiningId === item.sessionId;
    return (
      <Pressable
        onPress={() => handleJoin(item)}
        disabled={!!joiningId}
        accessibilityRole="button"
        accessibilityLabel={`Join game with ${item.players.join(', ')}`}
        style={({ pressed }) => [
          styles.sessionCard,
          {
            borderColor,
            opacity: joiningId && !isJoiningThis ? 0.5 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <PlayerMarquee players={item.players} chipColor={chipBg} textColor={textColor} />
        <ThemedText style={[styles.joinHint, { color: mutedColor }]}>
          {isJoiningThis ? 'Joining…' : 'Tap to join'}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText style={styles.backLabel}>‹ Back</ThemedText>
          </Pressable>
          <ThemedText type="title">Join a Game</ThemedText>
          <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
            Find a nearby game to join.
          </ThemedText>
        </View>

        <View style={styles.nameSection}>
          <ThemedText type="subtitle" style={styles.label}>Your Name</ThemedText>
          <TextInput
            placeholder="Player"
            placeholderTextColor={mutedColor}
            style={[styles.input, { borderColor, color: textColor }]}
            value={name}
            onChangeText={setName}
          />
        </View>

        {error && <ThemedText style={[styles.error, { color: errorColor }]}>{error}</ThemedText>}

        <View style={styles.listSection}>
          <ThemedText type="subtitle" style={styles.label}>Nearby Games</ThemedText>

          {sessions.length === 0 ? (
            <View style={styles.emptyState}>
              {isSearching ? (
                <>
                  <ActivityIndicator color={brandColor} />
                  <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
                    Searching for nearby games…
                  </ThemedText>
                </>
              ) : (
                <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
                  No games found nearby.
                </ThemedText>
              )}
            </View>
          ) : (
            <FlatList
              data={sessions}
              keyExtractor={(s) => s.sessionId}
              renderItem={renderSession}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
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
  nameSection: {
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
  error: {
    fontSize: responsiveFont(14),
  },
  listSection: {
    flex: 1,
    gap: spacing.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyText: {
    fontSize: responsiveFont(14),
    textAlign: 'center',
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  sessionCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(14),
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  marqueeContainer: {
    overflow: 'hidden',
  },
  marqueeInner: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    borderRadius: scale(8),
    paddingHorizontal: spacing.sm,
    paddingVertical: verticalScale(4),
  },
  chipText: {
    fontSize: responsiveFont(13),
  },
  joinHint: {
    fontSize: responsiveFont(12),
  },
});
