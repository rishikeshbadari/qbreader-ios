import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
  areDifficultySelectionsEqual,
  DIFFICULTY_PRESETS,
  DIFFICULTY_VALUES,
  getDifficultySelectionLabel,
} from '@/utils/difficulty';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

type DifficultySelectorProps = {
  selected: number[];
  onToggle: (values: number[]) => void;
  onSelectValues?: (values: number[]) => void;
  label?: string;
  disabled?: boolean;
  showHeader?: boolean;
  testIDPrefix?: string;
};

const LEVEL_ROWS = [
  DIFFICULTY_VALUES.slice(0, 5),
  DIFFICULTY_VALUES.slice(5),
];

export function DifficultySelector({
  selected,
  onToggle,
  onSelectValues,
  label = 'Difficulty',
  disabled = false,
  showHeader = true,
  testIDPrefix = 'difficulty',
}: DifficultySelectorProps) {
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const mutedColor = useThemeColor({}, 'muted');
  const textColor = useThemeColor({}, 'text');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const summary = getDifficultySelectionLabel(selected);
  const applyValues = onSelectValues ?? onToggle;

  return (
    <View style={styles.container}>
      {showHeader ? (
        <View style={styles.header}>
          <ThemedText type="defaultSemiBold" style={styles.label}>{label}</ThemedText>
          <ThemedText style={[styles.summary, { color: mutedColor }]} numberOfLines={1}>
            {summary}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.presetRow}>
        {DIFFICULTY_PRESETS.map((preset) => {
          const isSelected = areDifficultySelectionsEqual(selected, preset.values);
          return (
            <Pressable
              key={preset.label}
              onPress={() => applyValues(preset.values)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Select ${preset.label} difficulty`}
              accessibilityState={{ selected: isSelected, disabled }}
              testID={`${testIDPrefix}-preset-${preset.label}`}
              style={({ pressed }) => [
                styles.presetChip,
                {
                  borderColor: isSelected ? brandColor : borderColor,
                  backgroundColor: isSelected ? brandColor : 'transparent',
                  opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
                },
              ]}>
              <ThemedText
                type="defaultSemiBold"
                style={[styles.presetLabel, { color: isSelected ? '#fff' : textColor }]}>
                {preset.shortLabel}
              </ThemedText>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => applyValues(DIFFICULTY_VALUES)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Select all difficulty levels"
          accessibilityState={{ selected: areDifficultySelectionsEqual(selected, DIFFICULTY_VALUES), disabled }}
          testID={`${testIDPrefix}-preset-all`}
          style={({ pressed }) => {
            const isSelected = areDifficultySelectionsEqual(selected, DIFFICULTY_VALUES);
            return [
              styles.presetChip,
              {
                borderColor: isSelected ? brandColor : borderColor,
                backgroundColor: isSelected ? brandColor : 'transparent',
                opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
              },
            ];
          }}>
          <ThemedText
            type="defaultSemiBold"
            style={[
              styles.presetLabel,
              {
                color: areDifficultySelectionsEqual(selected, DIFFICULTY_VALUES)
                  ? '#fff'
                  : textColor,
              },
            ]}>
            All
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.levelGrid}>
        {LEVEL_ROWS.map((row) => (
          <View key={row[0]} style={styles.levelRow}>
            {row.map((level) => {
              const isSelected = selected.includes(level);
              return (
                <Pressable
                  key={level}
                  onPress={() => onToggle([level])}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Difficulty level ${level}`}
                  accessibilityState={{ selected: isSelected, disabled }}
                  testID={`${testIDPrefix}-level-${level}`}
                  style={({ pressed }) => [
                    styles.levelButton,
                    {
                      borderColor: isSelected ? brandColor : borderColor,
                      backgroundColor: isSelected ? brandColor : surfaceSecondaryColor,
                      opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
                    },
                  ]}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={[styles.levelLabel, { color: isSelected ? '#fff' : textColor }]}>
                    {level}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: {
    fontSize: responsiveFont(15),
  },
  summary: {
    flexShrink: 1,
    fontSize: responsiveFont(13),
    fontWeight: '600',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  presetChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(999),
    minHeight: MIN_TOUCH_TARGET - scale(8),
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(7),
  },
  presetLabel: {
    fontSize: responsiveFont(13),
  },
  levelGrid: {
    gap: spacing.xs,
  },
  levelRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  levelButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET - scale(4),
    borderRadius: scale(10),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelLabel: {
    fontSize: responsiveFont(15),
  },
});
