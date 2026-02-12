import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useSettings } from '@/hooks/useSettings';
import { useThemeColor } from '@/hooks/useThemeColor';
import { responsiveFont, scale, spacing, verticalScale, deviceMetrics } from '@/utils/responsive';

// Dynamic spacing based on screen height
const isCompactScreen = deviceMetrics.height < 700;
const dynamicGap = isCompactScreen ? verticalScale(8) : verticalScale(12);
const sectionPadding = isCompactScreen ? spacing.md : spacing.lg;
const chipPaddingV = isCompactScreen ? verticalScale(6) : verticalScale(8);

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const tabBarHeight = useBottomTabBarHeight();
  const backgroundColor = Colors[colorScheme ?? 'light'].background;
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
  const errorColor = useThemeColor({}, 'error');

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
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title">Settings</ThemedText>
          <ThemedText style={styles.subtitle}>
            Configure question difficulty and categories.
          </ThemedText>
        </View>

        {/* Reveal Speed */}
        <ThemedView style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Reveal Speed</ThemedText>
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
            style={styles.slider}
          />
        </ThemedView>

        {loadError ? (
          <ThemedView style={[styles.section, styles.errorCard, { borderColor }]}>
            <ThemedText type="defaultSemiBold" style={[styles.errorText, { color: errorColor }]}>
              {loadError}
            </ThemedText>
            <Pressable onPress={refreshOptions} style={[styles.refreshButton, { borderColor }]}>
              <ThemedText type="defaultSemiBold">Try again</ThemedText>
            </Pressable>
          </ThemedView>
        ) : null}

        {/* Difficulty */}
        <ThemedView style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Difficulty</ThemedText>
            <Pressable onPress={selectAllDifficulties} hitSlop={8}>
              <ThemedText style={[styles.actionLink, { color: brandColor }]}>
                Select all
              </ThemedText>
            </Pressable>
          </View>
          {showDifficultyPlaceholder ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.chipGrid}>{renderDifficultyChips()}</View>
          )}
          {selectionErrors.difficulty ? (
            <ThemedText style={[styles.errorMessage, { color: errorColor }]}>{selectionErrors.difficulty}</ThemedText>
          ) : null}
        </ThemedView>

        {/* Categories */}
        <ThemedView style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Categories</ThemedText>
            <Pressable onPress={selectAllCategories} hitSlop={8}>
              <ThemedText style={[styles.actionLink, { color: brandColor }]}>
                Select all
              </ThemedText>
            </Pressable>
          </View>
          {showCategoryPlaceholder ? (
            <ActivityIndicator />
          ) : (
            <View style={styles.chipGrid}>{renderCategoryChips()}</View>
          )}
          {selectionErrors.category ? (
            <ThemedText style={[styles.errorMessage, { color: errorColor }]}>{selectionErrors.category}</ThemedText>
          ) : null}
        </ThemedView>

        {loadingOptions && !showDifficultyPlaceholder && !showCategoryPlaceholder ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <ThemedText style={styles.loadingLabel}>Refreshing…</ThemedText>
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: dynamicGap,
  },
  header: {
    gap: spacing.xs,
  },
  subtitle: {
    opacity: 0.7,
    fontSize: responsiveFont(14),
  },
  section: {
    borderRadius: scale(16),
    padding: sectionPadding,
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
  speedLabel: {
    fontSize: responsiveFont(14),
  },
  slider: {
    marginHorizontal: -spacing.xs,
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
    paddingVertical: chipPaddingV,
  },
  chipLabel: {
    fontSize: responsiveFont(13),
  },
  actionLink: {
    fontSize: responsiveFont(14),
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingLabel: {
    opacity: 0.7,
    fontSize: responsiveFont(13),
  },
  errorCard: {
    borderWidth: scale(1),
  },
  errorText: {
    fontSize: responsiveFont(14),
  },
  errorMessage: {
    fontSize: responsiveFont(13),
  },
  refreshButton: {
    alignSelf: 'flex-start',
    borderWidth: scale(1),
    borderRadius: scale(8),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
