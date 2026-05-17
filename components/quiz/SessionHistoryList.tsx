import { SectionList, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactElement } from 'react';

import { DirectivePill } from '@/components/quiz/DirectivePill';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { SessionHistoryEntry } from '@/types/qb';
import { normalizeDirective } from '@/utils/directives';
import { stripHtmlTags, truncateText } from '@/utils/text';
import { responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

interface Props {
  history: SessionHistoryEntry[];
  ListHeaderComponent?: ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  groupByDirective?: boolean;
}

type Section = {
  title: string;
  data: SessionHistoryEntry[];
};

const SECTION_CONFIG = [
  {
    key: 'correct',
    title: 'Correct',
    match: (directive: string) => directive === 'accept',
  },
  {
    key: 'skipped',
    title: 'Skipped',
    match: (directive: string) => directive === 'skip',
  },
  {
    key: 'incorrect',
    title: 'Incorrect',
    match: (directive: string) =>
      directive !== 'accept' && directive !== 'skip',
  },
];

export function SessionHistoryList({
  history,
  ListHeaderComponent,
  contentContainerStyle,
  style,
  groupByDirective = true,
}: Props) {
  const borderColor = useThemeColor({}, 'border');

  const sections: Section[] = groupByDirective
    ? SECTION_CONFIG.map((config) => ({
        title: config.title,
        data: history.filter((entry) => config.match(normalizeDirective(entry.result))),
      })).filter((section) => section.data.length > 0)
    : history.length > 0
      ? [
          {
            title: 'all',
            data: history,
          },
        ]
      : [];

  if (sections.length === 0) {
    return (
      <View style={style}>
        <View style={[styles.listContent, contentContainerStyle, styles.emptyContent]}>
          {ListHeaderComponent}
          <ThemedView
            lightColor={Colors.light.surface}
            darkColor={Colors.dark.surface}
            style={[styles.emptyState, { borderColor }]}>
            <ThemedText type="defaultSemiBold">No answers yet</ThemedText>
          </ThemedView>
        </View>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      style={style}
      contentContainerStyle={[styles.listContent, contentContainerStyle]}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={ListHeaderComponent}
      SectionSeparatorComponent={
        groupByDirective ? () => <View style={styles.sectionSeparator} /> : undefined
      }
      renderSectionHeader={
        groupByDirective
          ? ({ section }) => (
              <View style={styles.sectionHeader}>
                <ThemedText type="subtitle">{section.title}</ThemedText>
                <ThemedText style={styles.sectionCount}>{section.data.length}</ThemedText>
              </View>
            )
          : undefined
      }
      renderItem={({ item }) => (
        <ThemedView
          lightColor={Colors.light.surface}
          darkColor={Colors.dark.surface}
          style={[styles.historyRow, { borderColor }]}>
          <View style={styles.historyHeader}>
            <View>
              <ThemedText type="defaultSemiBold">
                {item.tossup.category ?? 'Unknown category'}
              </ThemedText>
              <ThemedText style={styles.timestamp}>
                {new Date(item.timestamp).toLocaleString()}
              </ThemedText>
            </View>
            <DirectivePill result={item.result} />
          </View>
          <ThemedText style={styles.questionPreview}>
            {truncateText(stripHtmlTags(item.tossup.questionHtml), 160)}
          </ThemedText>
          <View style={styles.answerPreview}>
            <ThemedText style={styles.answerLabel}>You</ThemedText>
            <ThemedText style={styles.answerValue}>{item.userAnswer || '—'}</ThemedText>
          </View>
          <View style={styles.answerPreview}>
            <ThemedText style={styles.answerLabel}>Answer</ThemedText>
            <ThemedText style={styles.answerValue}>{item.tossup.answer}</ThemedText>
          </View>
          {item.result.directedPrompt ? (
            <ThemedText style={styles.prompt}>
              Prompt: {item.result.directedPrompt}
            </ThemedText>
          ) : null}
        </ThemedView>
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: verticalScale(40),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionCount: {
    opacity: 0.7,
  },
  sectionSeparator: {
    height: verticalScale(24),
  },
  emptyState: {
    borderRadius: scale(20),
    borderWidth: scale(1),
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: verticalScale(160),
  },
  emptyContent: {
    flexGrow: 1,
  },
  historyRow: {
    borderRadius: scale(20),
    borderWidth: scale(1),
    padding: spacing.lg,
    gap: spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  questionPreview: {
    fontSize: responsiveFont(15),
    lineHeight: verticalScale(22),
  },
  answerPreview: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  answerLabel: {
    fontWeight: '600',
  },
  answerValue: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  prompt: {
    fontStyle: 'italic',
  },
  timestamp: {
    fontSize: responsiveFont(13),
    opacity: 0.7,
  },
});
