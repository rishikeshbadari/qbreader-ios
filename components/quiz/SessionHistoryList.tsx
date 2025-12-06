import { SectionList, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactElement } from 'react';

import { DirectivePill } from '@/components/quiz/DirectivePill';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { SessionHistoryEntry } from '@/types/qb';
import { stripHtmlTags, truncateText } from '@/utils/text';

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
        data: history.filter((entry) =>
          config.match(entry.result.directive.toLowerCase())
        ),
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
        {ListHeaderComponent}
        <ThemedView
          lightColor={Colors.light.surface}
          darkColor={Colors.dark.surface}
          style={[styles.emptyState, { borderColor }]}>
          <ThemedText type="defaultSemiBold">No answers yet</ThemedText>
          <ThemedText>
            Play a tossup and each buzz will appear here with the judged result.
          </ThemedText>
        </ThemedView>
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
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionCount: {
    opacity: 0.7,
  },
  sectionSeparator: {
    height: 24,
  },
  emptyState: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 8,
  },
  historyRow: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  questionPreview: {
    fontSize: 15,
    lineHeight: 22,
  },
  answerPreview: {
    flexDirection: 'row',
    gap: 6,
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
    fontSize: 13,
    opacity: 0.7,
  },
});
