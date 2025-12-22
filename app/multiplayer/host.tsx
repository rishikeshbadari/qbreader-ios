import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useSettings } from '@/hooks/useSettings';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { CategoryOption, DifficultyOption } from '@/services/qbreader';

export default function HostGameScreen() {
  const { hostSession } = useMultiplayer();
  const {
    availableCategories,
    availableDifficulties,
    revealSpeed,
    loadingOptions,
    loadError,
    refreshOptions,
  } = useSettings();
  const router = useRouter();
  const [name, setName] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [categorySelection, setCategorySelection] = useState<string[]>([]);
  const [difficultySelection, setDifficultySelection] = useState<number[]>([]);
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textOnBrand = '#fff';

  const allDifficulties = useMemo(
    () => availableDifficulties.flatMap((d) => d.values),
    [availableDifficulties]
  );

  const allCategories = useMemo(
    () => availableCategories.map((c) => c.name),
    [availableCategories]
  );

  useEffect(() => {
    if (availableDifficulties.length > 0 && difficultySelection.length === 0) {
      setDifficultySelection(allDifficulties);
    }
    if (availableCategories.length > 0 && categorySelection.length === 0) {
      setCategorySelection(allCategories);
    }
  }, [allCategories, allDifficulties, availableCategories.length, availableDifficulties.length, categorySelection.length, difficultySelection.length]);

  const toggleDifficulty = (option: DifficultyOption) => {
    const values = option.values;
    const isSelected = values.every((v) => difficultySelection.includes(v));
    if (isSelected) {
      const next = difficultySelection.filter((v) => !values.includes(v));
      setDifficultySelection(next.length > 0 ? next : values); // keep at least one group
    } else {
      setDifficultySelection(Array.from(new Set([...difficultySelection, ...values])));
    }
  };

  const toggleCategory = (name: string) => {
    const isSelected = categorySelection.includes(name);
    if (isSelected) {
      const next = categorySelection.filter((c) => c !== name);
      setCategorySelection(next.length > 0 ? next : [name]); // keep at least one
    } else {
      setCategorySelection([...categorySelection, name].sort((a, b) => a.localeCompare(b)));
    }
  };

  const handleStart = async () => {
    if (isStarting) {
      return;
    }
    if (categorySelection.length === 0 || difficultySelection.length === 0) {
      setError('Choose at least one category and difficulty.');
      return;
    }
    setIsStarting(true);
    setError(undefined);
    try {
      const sessionId = await hostSession(
        {
          difficulties: difficultySelection,
          categories: categorySelection,
          revealSpeed,
        },
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
    <ThemedView style={styles.container}>
      <ThemedText type="title">Start a game</ThemedText>
      <ThemedText style={styles.subtitle}>
        Pick categories and difficulties for this game. Everyone will play with these settings.
      </ThemedText>
      <View style={styles.field}>
        <ThemedText style={styles.label}>Your name</ThemedText>
        <TextInput
          placeholder="Player"
          selectionColor={textOnBrand}
          placeholderTextColor={textOnBrand}
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
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText type="defaultSemiBold">Difficulty</ThemedText>
          <Pressable onPress={() => setDifficultySelection(allDifficulties)}>
            <ThemedText style={styles.link}>Select all</ThemedText>
          </Pressable>
        </View>
        {loadingOptions ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <View style={styles.chipGrid}>
            {availableDifficulties.map((option) => {
              const isSelected = option.values.every((v) => difficultySelection.includes(v));
              return (
                <Pressable
                  key={option.label}
                  onPress={() => toggleDifficulty(option)}
                  style={[
                    styles.chip,
                    {
                      borderColor,
                      backgroundColor: isSelected ? brandColor : 'transparent',
                    },
                  ]}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={[styles.chipLabel, { color: isSelected ? '#fff' : '#0f172a' }]}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText type="defaultSemiBold">Categories</ThemedText>
          <Pressable onPress={() => setCategorySelection(allCategories)}>
            <ThemedText style={styles.link}>Select all</ThemedText>
          </Pressable>
        </View>
        {loadingOptions ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <View style={styles.chipGrid}>
            {availableCategories.map((category) => {
              const isSelected = categorySelection.includes(category.name);
              return (
                <Pressable
                  key={category.name}
                  onPress={() => toggleCategory(category.name)}
                  style={[
                    styles.chip,
                    {
                      borderColor,
                      backgroundColor: isSelected ? brandColor : 'transparent',
                    },
                  ]}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={[styles.chipLabel, { color: isSelected ? '#fff' : '#0f172a' }]}>
                    {category.name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {loadError ? (
        <View style={styles.errorCard}>
          <ThemedText style={styles.error}>{loadError}</ThemedText>
          <Pressable onPress={refreshOptions}>
            <ThemedText type="defaultSemiBold" style={styles.link}>
              Try again
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <Pressable
        onPress={handleStart}
        disabled={isStarting || loadingOptions}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: brandColor, opacity: isStarting || loadingOptions ? 0.5 : pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>
          {isStarting ? 'Starting…' : 'Start game'}
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
  subtitle: {
    opacity: 0.8,
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
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  link: {
    color: '#0f172a',
    opacity: 0.8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipLabel: {
    letterSpacing: 0.3,
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    borderColor: '#DC2626',
    gap: 6,
  },
  loading: {
    marginVertical: 8,
  },
});
