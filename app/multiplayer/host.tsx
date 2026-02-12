import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useSettings } from '@/hooks/useSettings';
import { useThemeColor } from '@/hooks/useThemeColor';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export default function HostGameScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { hostGame } = useMultiplayer();
  const { availableCategories, availableDifficulties, revealSpeed, loadingOptions } = useSettings();
  const router = useRouter();

  const [name, setName] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<number[]>([]);

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const errorColor = useThemeColor({}, 'error');

  // Initialize selections when options load
  const allDifficulties = useMemo(() => availableDifficulties.flatMap(d => d.values), [availableDifficulties]);
  const allCategories = useMemo(() => availableCategories.map(c => c.name), [availableCategories]);

  useEffect(() => {
    if (availableDifficulties.length > 0 && selectedDifficulties.length === 0) {
      setSelectedDifficulties(allDifficulties);
    }
    if (availableCategories.length > 0 && selectedCategories.length === 0) {
      setSelectedCategories(allCategories);
    }
  }, [allCategories, allDifficulties, availableCategories.length, availableDifficulties.length]);

  const toggleDifficulty = (values: number[]) => {
    const isSelected = values.every(v => selectedDifficulties.includes(v));
    if (isSelected) {
      const next = selectedDifficulties.filter(v => !values.includes(v));
      setSelectedDifficulties(next.length > 0 ? next : values);
    } else {
      setSelectedDifficulties([...new Set([...selectedDifficulties, ...values])]);
    }
  };

  const toggleCategory = (categoryName: string) => {
    const isSelected = selectedCategories.includes(categoryName);
    if (isSelected) {
      const next = selectedCategories.filter(c => c !== categoryName);
      setSelectedCategories(next.length > 0 ? next : [categoryName]);
    } else {
      setSelectedCategories([...selectedCategories, categoryName].sort());
    }
  };

  const handleStart = async () => {
    if (isStarting || selectedCategories.length === 0 || selectedDifficulties.length === 0) {
      setError('Select at least one category and difficulty.');
      return;
    }

    setIsStarting(true);
    setError(undefined);

    try {
      const sessionId = await hostGame(
        { difficulties: selectedDifficulties, categories: selectedCategories, revealSpeed },
        name.trim() || 'Player'
      );
      router.replace({ pathname: '/multiplayer/game', params: { sessionId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start game.');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText style={styles.backLabel}>‹ Back</ThemedText>
          </Pressable>
          <ThemedText type="title">Start a Game</ThemedText>
          <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
            Choose settings for this game session.
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
          />
        </View>

        {/* Difficulty */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Difficulty</ThemedText>
            <Pressable onPress={() => setSelectedDifficulties(allDifficulties)} hitSlop={8}>
              <ThemedText style={[styles.link, { color: brandColor }]}>Select all</ThemedText>
            </Pressable>
          </View>
          {loadingOptions ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.chipGrid}>
              {availableDifficulties.map(option => {
                const isSelected = option.values.every(v => selectedDifficulties.includes(v));
                return (
                  <Pressable
                    key={option.label}
                    onPress={() => toggleDifficulty(option.values)}
                    style={[styles.chip, { borderColor, backgroundColor: isSelected ? brandColor : 'transparent' }]}>
                    <ThemedText style={[styles.chipLabel, { color: isSelected ? '#fff' : textColor }]}>
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Categories</ThemedText>
            <Pressable onPress={() => setSelectedCategories(allCategories)} hitSlop={8}>
              <ThemedText style={[styles.link, { color: brandColor }]}>Select all</ThemedText>
            </Pressable>
          </View>
          {loadingOptions ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.chipGrid}>
              {availableCategories.map(category => {
                const isSelected = selectedCategories.includes(category.name);
                return (
                  <Pressable
                    key={category.name}
                    onPress={() => toggleCategory(category.name)}
                    style={[styles.chip, { borderColor, backgroundColor: isSelected ? brandColor : 'transparent' }]}>
                    <ThemedText style={[styles.chipLabel, { color: isSelected ? '#fff' : textColor }]}>
                      {category.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {error && <ThemedText style={[styles.error, { color: errorColor }]}>{error}</ThemedText>}
      </ScrollView>

      {/* Start button */}
      <Pressable
        onPress={handleStart}
        disabled={isStarting || loadingOptions}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: brandColor, opacity: isStarting || loadingOptions ? 0.5 : pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>
          {isStarting ? 'Starting…' : 'Start Game'}
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
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: responsiveFont(16),
  },
  link: {
    fontSize: responsiveFont(14),
    fontWeight: '600',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(10),
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(12),
    fontSize: responsiveFont(16),
    minHeight: MIN_TOUCH_TARGET,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(8),
    paddingHorizontal: spacing.sm,
    paddingVertical: verticalScale(6),
  },
  chipLabel: {
    fontSize: responsiveFont(13),
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
  error: {
    fontSize: responsiveFont(14),
  },
});
