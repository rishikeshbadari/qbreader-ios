import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SCORING } from '@/types/multiplayer';
import { responsiveFont, scale, spacing, verticalScale, MIN_TOUCH_TARGET } from '@/utils/responsive';

const RULES = [
  {
    title: 'Buzzing In',
    body: 'Questions are revealed word by word. Tap the buzz button at any point to answer. Once you buzz, no one else can answer until you submit or time runs out.',
  },
  {
    title: 'Answering',
    body: `After buzzing, you have ${SCORING.BUZZ_TIMEOUT_SECONDS} seconds to type your answer and submit. If time runs out, you are locked out for the rest of the question.`,
  },
  {
    title: 'Scoring',
    body: `Correct answer: +${SCORING.CORRECT} points.\nPower (correct before the power mark *): +${SCORING.POWER} points.\nIncorrect answers: no point penalty.`,
  },
  {
    title: 'Lockouts',
    body: 'If you answer incorrectly, you are locked out for the rest of that question. Other players can still buzz in. If everyone gets it wrong, the answer is revealed and the next question begins.',
  },
  {
    title: 'Power Marks',
    body: 'Some questions have a power mark (*) partway through. Buzzing and answering correctly before the power mark earns bonus points.',
  },
  {
    title: 'Settings',
    body: 'Only the host can pause the game to change difficulty, categories, or reveal speed. Other players will see that settings are being changed.',
  },
  {
    title: 'Leaving & Joining',
    body: 'Players can leave at any time without ending the game for others. New players can join mid-game and will be synced to the current state. The game only ends when all players leave.',
  },
];

export default function MultiplayerRulesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const mutedColor = useThemeColor({}, 'muted');

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}>
          <ThemedText style={styles.backLabel}>‹ Back</ThemedText>
        </Pressable>
        <ThemedText type="title">How to Play</ThemedText>
        <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
          Multiplayer quiz bowl rules and scoring.
        </ThemedText>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {RULES.map((rule, idx) => (
          <View key={idx} style={[styles.card, { borderColor }]}>
            <ThemedText type="defaultSemiBold" style={styles.ruleTitle}>{rule.title}</ThemedText>
            <ThemedText style={[styles.ruleBody, { color: mutedColor }]}>{rule.body}</ThemedText>
          </View>
        ))}
      </ScrollView>

      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: brandColor, opacity: pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>Got It</ThemedText>
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
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(12),
    padding: spacing.md,
    gap: spacing.xs,
  },
  ruleTitle: {
    fontSize: responsiveFont(15),
  },
  ruleBody: {
    fontSize: responsiveFont(14),
    lineHeight: responsiveFont(20),
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
