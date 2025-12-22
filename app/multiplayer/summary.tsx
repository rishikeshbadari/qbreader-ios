import { Link, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useMultiplayer } from '@/context/MultiplayerContext';

export default function MultiplayerSummaryScreen() {
  const { summary } = useMultiplayer();
  const router = useRouter();

  const handleDone = () => {
    router.replace('/multiplayer');
  };

  if (!summary) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">No game data</ThemedText>
        <Link href="/multiplayer">Back to multiplayer</Link>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Game summary</ThemedText>
      <ThemedText style={styles.subtitle}>Players: {summary.players.map((p) => p.name).join(', ')}</ThemedText>
      <ScrollView style={styles.list} contentContainerStyle={{ gap: 12 }}>
        {summary.questions.length === 0 ? (
          <ThemedText style={styles.muted}>No questions played.</ThemedText>
        ) : (
          summary.questions.map((item, idx) => (
            <View key={`${item.question.id ?? idx}-${idx}`} style={styles.questionCard}>
              <ThemedText type="defaultSemiBold">Question {idx + 1}</ThemedText>
              <ThemedText style={styles.muted}>{item.question.setName ?? 'Random set'}</ThemedText>
              <ThemedText style={styles.questionText}>{item.question.question}</ThemedText>
              <ThemedText style={styles.answerLabel}>Answer</ThemedText>
              <ThemedText style={styles.answerText}>{item.question.answer}</ThemedText>
              <View style={styles.buzzes}>
                {item.buzzes.length === 0 ? (
                  <ThemedText style={styles.muted}>No buzzes</ThemedText>
                ) : (
                  item.buzzes.map((buzz, buzzIdx) => {
                    const playerName = summary.players.find((p) => p.id === buzz.playerId)?.name ?? buzz.playerId;
                    return (
                      <ThemedText key={`${buzz.playerId}-${buzzIdx}`} style={styles.buzzEntry}>
                        {playerName}: {buzz.result?.directive ?? 'pending'} ({buzz.answer})
                      </ThemedText>
                    );
                  })
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <ThemedText onPress={handleDone} style={styles.doneLink}>
        Done
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  subtitle: {
    opacity: 0.8,
  },
  list: {
    flex: 1,
  },
  questionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderColor: '#E2E8F0',
  },
  questionText: {
    opacity: 0.9,
  },
  answerLabel: {
    marginTop: 4,
    opacity: 0.8,
  },
  answerText: {
    fontWeight: '600',
  },
  buzzes: {
    marginTop: 6,
    gap: 4,
  },
  buzzEntry: {
    opacity: 0.9,
  },
  muted: {
    opacity: 0.6,
  },
  doneLink: {
    textAlign: 'center',
    marginTop: 8,
    color: '#0f172a',
    fontWeight: '600',
  },
});
