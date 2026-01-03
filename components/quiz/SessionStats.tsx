import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { SessionStats as SessionStatsType } from '@/types/qb';
import { responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

export type SessionStatsCardKey = 'answered' | 'correct' | 'skipped' | 'incorrect' | 'streak';

interface Props {
  stats: SessionStatsType;
  compact?: boolean;
  onSelectCard?: (key: SessionStatsCardKey) => void;
}

export function SessionStats({ stats, compact = false, onSelectCard }: Props) {
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');

  const cards: {
    key: SessionStatsCardKey;
    label: string;
    value: string;
    interactive?: boolean;
  }[] = [
    { key: 'answered', label: 'All', value: stats.total.toString(), interactive: true },
    { key: 'correct', label: 'Correct', value: stats.correct.toString(), interactive: true },
    { key: 'skipped', label: 'Skipped', value: stats.skipped.toString(), interactive: true },
    { key: 'incorrect', label: 'Incorrect', value: stats.incorrect.toString(), interactive: true },
    { key: 'streak', label: 'Streak', value: `${stats.streak}` },
  ];

  const accuracyPercent = Math.round(stats.accuracy * 100);

  return (
    <ThemedView
      lightColor={Colors.light.surface}
      darkColor={Colors.dark.surface}
      style={[styles.container, { borderColor }]}>
      <View style={styles.header}>
        <ThemedText type={compact ? 'defaultSemiBold' : 'subtitle'}>
          Session stats
        </ThemedText>
        <ThemedText type="defaultSemiBold">{accuracyPercent}% accuracy</ThemedText>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${accuracyPercent}%`, backgroundColor: brandColor },
          ]}
        />
      </View>
      <View style={styles.cardGrid}>
        {cards.map((card) => {
          const isInteractive = Boolean(onSelectCard) && card.interactive;
          const commonStyle = [
            styles.card,
            {
              borderColor,
              paddingVertical: compact ? 8 : 12,
            },
          ];
          if (isInteractive) {
            return (
              <Pressable
                key={card.key}
                accessibilityRole="button"
                onPress={() => onSelectCard?.(card.key)}
                style={({ pressed }) => [...commonStyle, { opacity: pressed ? 0.7 : 1 }]}>
                <ThemedText style={styles.cardLabel}>{card.label}</ThemedText>
                <ThemedText type="defaultSemiBold" style={styles.cardValue}>
                  {card.value}
                </ThemedText>
              </Pressable>
            );
          }

          return (
            <View key={card.key} style={commonStyle}>
              <ThemedText style={styles.cardLabel}>{card.label}</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.cardValue}>
                {card.value}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: scale(1),
    borderRadius: scale(20),
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTrack: {
    height: verticalScale(6),
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    borderWidth: scale(1),
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    minWidth: '30%',
  },
  cardLabel: {
    fontSize: responsiveFont(12),
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardValue: {
    fontSize: responsiveFont(20),
  },
});
