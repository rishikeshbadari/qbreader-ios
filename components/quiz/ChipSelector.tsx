import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export interface ChipOption {
  label: string;
  /** Values associated with this chip (e.g., difficulty values). */
  values: number[];
}

export interface CategoryChipOption {
  name: string;
}

interface DifficultyChipSelectorProps {
  kind: 'difficulty';
  options: ChipOption[];
  selected: number[];
  onToggle: (values: number[]) => void;
  onSelectAll?: () => void;
  label: string;
}

interface CategoryChipSelectorProps {
  kind: 'category';
  options: CategoryChipOption[];
  selected: string[];
  onToggle: (name: string) => void;
  onSelectAll?: () => void;
  label: string;
}

type Props = DifficultyChipSelectorProps | CategoryChipSelectorProps;

export function ChipSelector(props: Props) {
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="defaultSemiBold" style={styles.label}>{props.label}</ThemedText>
        {props.onSelectAll && (
          <Pressable onPress={props.onSelectAll} hitSlop={8}>
            <ThemedText style={[styles.selectAll, { color: brandColor }]}>
              Select all
            </ThemedText>
          </Pressable>
        )}
      </View>
      <View style={styles.chipGrid}>
        {props.kind === 'difficulty'
          ? props.options.map((option) => {
              const isSelected = option.values.every((v) => props.selected.includes(v));
              return (
                <Pressable
                  key={option.label}
                  onPress={() => props.onToggle(option.values)}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.label}${isSelected ? ', selected' : ''}`}
                  style={[
                    styles.chip,
                    { borderColor, backgroundColor: isSelected ? brandColor : 'transparent' },
                  ]}>
                  <ThemedText style={[styles.chipLabel, { color: isSelected ? '#fff' : textColor }]}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              );
            })
          : props.options.map((option) => {
              const isSelected = props.selected.includes(option.name);
              return (
                <Pressable
                  key={option.name}
                  onPress={() => props.onToggle(option.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.name}${isSelected ? ', selected' : ''}`}
                  style={[
                    styles.chip,
                    { borderColor, backgroundColor: isSelected ? brandColor : 'transparent' },
                  ]}>
                  <ThemedText style={[styles.chipLabel, { color: isSelected ? '#fff' : textColor }]}>
                    {option.name}
                  </ThemedText>
                </Pressable>
              );
            })}
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: responsiveFont(15),
  },
  selectAll: {
    fontSize: responsiveFont(14),
    fontWeight: '600',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(7),
    minHeight: MIN_TOUCH_TARGET - scale(8),
    justifyContent: 'center',
  },
  chipLabel: {
    fontSize: responsiveFont(13),
  },
});
