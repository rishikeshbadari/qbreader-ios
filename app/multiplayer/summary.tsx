import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { responsiveFont, scale, spacing, verticalScale, MIN_TOUCH_TARGET } from '@/utils/responsive';

export default function MultiplayerSummaryScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { summary } = useMultiplayer();
  const router = useRouter();

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const successColor = useThemeColor({}, 'success');
  const errorColor = useThemeColor({}, 'error');

  const handleDone = () => router.replace('/(tabs)/multiplayer');

  if (!summary) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
        <ThemedText type="title">No Game Data</ThemedText>
          <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
            There's no game summary to display.
          </ThemedText>
          <Pressable
            onPress={handleDone}
            style={[styles.button, { backgroundColor: brandColor }]}>
            <ThemedText style={styles.buttonLabel}>Back to Multiplayer</ThemedText>
          </Pressable>
      </ThemedView>
    );
  }

  const playerNames = summary.players.map(p => p.name).join(', ');

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <ThemedText type="title">Game Summary</ThemedText>
        <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
          Players: {playerNames}
        </ThemedText>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {summary.questions.length === 0 ? (
          <ThemedText style={[styles.empty, { color: mutedColor }]}>No questions played.</ThemedText>
        ) : (
          summary.questions.map((record, idx) => (
            <View key={record.question.id ?? idx} style={[styles.card, { borderColor }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold">Question {idx + 1}</ThemedText>
                <ThemedText style={[styles.setName, { color: mutedColor }]}>
                  {record.question.setName ?? 'Random'}
                </ThemedText>
              </View>

              <ThemedText style={styles.questionText} numberOfLines={3}>
                {record.question.question}
              </ThemedText>

              <View style={styles.answerRow}>
                <ThemedText style={[styles.answerLabel, { color: mutedColor }]}>Answer:</ThemedText>
                <ThemedText type="defaultSemiBold" style={{ color: textColor }}>
                  {record.question.answer}
                </ThemedText>
              </View>

              {record.buzzes.length > 0 && (
                <View style={styles.buzzes}>
                  {record.buzzes.map((buzz, buzzIdx) => {
                    const player = summary.players.find(p => p.id === buzz.playerId);
                    const isCorrect = buzz.result?.directive === 'accept';
                    return (
                      <View key={buzzIdx} style={styles.buzzRow}>
                        <ThemedText style={{ color: textColor }}>
                          {player?.name ?? 'Unknown'}:
                        </ThemedText>
                        <ThemedText style={{ color: isCorrect ? successColor : errorColor }}>
                          {buzz.result?.directive ?? 'pending'}
                        </ThemedText>
                        <ThemedText style={[styles.buzzAnswer, { color: mutedColor }]}>
                          "{buzz.answer}"
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={handleDone}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: brandColor, opacity: pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>Done</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  subtitle: {
    fontSize: responsiveFont(14),
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  empty: {
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(12),
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  setName: {
    fontSize: responsiveFont(12),
  },
  questionText: {
    fontSize: responsiveFont(14),
    lineHeight: responsiveFont(20),
  },
  answerRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  answerLabel: {
    fontSize: responsiveFont(14),
  },
  buzzes: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  buzzRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  buzzAnswer: {
    fontSize: responsiveFont(13),
    fontStyle: 'italic',
  },
  button: {
    borderRadius: scale(12),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: responsiveFont(16),
  },
});
