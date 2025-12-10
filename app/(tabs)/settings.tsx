import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSettings } from '@/hooks/useSettings';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function SettingsScreen() {
  const {
    availableDifficulties,
    availableCategories,
    selectedDifficulties,
    selectedCategories,
    revealSpeed,
    toggleDifficulty,
    toggleCategory,
    selectAllDifficulties,
    selectAllCategories,
    setRevealSpeed,
    loadingOptions,
    loadError,
    refreshOptions,
    selectionErrors,
  } = useSettings();
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');

  const revealSpeedLabel =
    revealSpeed >= 0.95
      ? 'Instant'
      : revealSpeed >= 0.7
        ? 'Fast'
        : revealSpeed >= 0.4
          ? 'Moderate'
          : revealSpeed >= 0.2
            ? 'Slow'
            : 'Very slow';

  const renderDifficultyChips = () =>
    availableDifficulties.map((option) => {
      const isSelected = option.values.every((value) => selectedDifficulties.includes(value));
      return (
        <Pressable
          key={option.label}
          onPress={() => toggleDifficulty(option.values)}
          style={[
            styles.chip,
            {
              borderColor,
              backgroundColor: isSelected ? brandColor : 'transparent',
            },
          ]}>
          <ThemedText
            type="defaultSemiBold"
            style={[styles.chipLabel, { color: isSelected ? '#fff' : textColor }]}>
            {option.label}
          </ThemedText>
        </Pressable>
      );
    });

  const renderCategoryChips = () =>
    availableCategories.map((category) => {
      const isSelected = selectedCategories.includes(category.name);
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
            style={[styles.chipLabel, { color: isSelected ? '#fff' : textColor }]}>
            {category.name}
          </ThemedText>
        </Pressable>
      );
    });

  const showDifficultyPlaceholder =
    loadingOptions && availableDifficulties.length === 0;
  const showCategoryPlaceholder = loadingOptions && availableCategories.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.section}>
          <ThemedText type="title">Settings</ThemedText>
          <ThemedText style={styles.subtitle}>
            Difficulty and category filters update the requests we send to QBReader&apos;s
            public API before each tossup.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Question reveal speed</ThemedText>
            <ThemedText style={[styles.speedLabel, { color: mutedColor }]}>
              {revealSpeedLabel}
            </ThemedText>
          </View>
          <Slider
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={revealSpeed}
            onValueChange={setRevealSpeed}
            minimumTrackTintColor={brandColor}
            maximumTrackTintColor={borderColor}
            thumbTintColor={brandColor}
            accessibilityLabel="Question reveal speed"
          />
          <View style={styles.speedLegends}>
            <ThemedText style={[styles.speedLegend, { color: mutedColor }]}>Very slow</ThemedText>
            <ThemedText style={[styles.speedLegend, { color: mutedColor }]}>Instant</ThemedText>
          </View>
        </ThemedView>

        {loadError ? (
          <ThemedView style={[styles.section, styles.errorCard, { borderColor }]}>
            <ThemedText type="defaultSemiBold" style={styles.errorText}>
              {loadError}
            </ThemedText>
            <Pressable onPress={refreshOptions} style={[styles.refreshButton, { borderColor }]}>
              <ThemedText type="defaultSemiBold">Try again</ThemedText>
            </Pressable>
          </ThemedView>
        ) : null}

        <ThemedView style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Difficulty</ThemedText>
            <Pressable onPress={selectAllDifficulties}>
              <ThemedText type="defaultSemiBold" style={styles.actionLink}>
                Select all
              </ThemedText>
            </Pressable>
          </View>
          {showDifficultyPlaceholder ? (
            <ActivityIndicator style={styles.loadingIndicator} />
          ) : (
            <View style={styles.chipGrid}>{renderDifficultyChips()}</View>
          )}
          {selectionErrors.difficulty ? (
            <ThemedText style={styles.errorMessage}>{selectionErrors.difficulty}</ThemedText>
          ) : null}
        </ThemedView>

        <ThemedView style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Categories</ThemedText>
            <Pressable onPress={selectAllCategories}>
              <ThemedText type="defaultSemiBold" style={styles.actionLink}>
                Select all
              </ThemedText>
            </Pressable>
          </View>
          {showCategoryPlaceholder ? (
            <ActivityIndicator style={styles.loadingIndicator} />
          ) : (
            <View style={styles.chipGrid}>{renderCategoryChips()}</View>
          )}
          {selectionErrors.category ? (
            <ThemedText style={styles.errorMessage}>{selectionErrors.category}</ThemedText>
          ) : null}
        </ThemedView>

        {loadingOptions && !showDifficultyPlaceholder && !showCategoryPlaceholder ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <ThemedText style={styles.loadingLabel}>Refreshing filters…</ThemedText>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 20,
  },
  section: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  subtitle: {
    opacity: 0.8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  speedLabel: {
    opacity: 0.8,
  },
  speedLegends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  speedLegend: {
    fontSize: 12,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipLabel: {
    letterSpacing: 0.3,
  },
  actionLink: {
    opacity: 0.8,
  },
  loadingIndicator: {
    marginTop: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingLabel: {
    opacity: 0.8,
  },
  errorCard: {
    borderWidth: 1,
  },
  errorText: {
    color: '#DC2626',
  },
  errorMessage: {
    marginTop: 8,
    color: '#DC2626',
    fontWeight: '600',
  },
  refreshButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
});
