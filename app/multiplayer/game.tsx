import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { AnswerInput } from '@/components/quiz/AnswerInput';

export default function MultiplayerGameScreen() {
  const { sessionId: routeSessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const {
    status,
    sessionId,
    players,
    settings,
    currentQuestion,
    currentResult,
    loadingQuestion,
    buzzLocked,
    startNextQuestion,
    submitBuzz,
  } = useMultiplayer();
  const [answer, setAnswer] = useState('');
  const [showInput, setShowInput] = useState(false);
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const { height } = useWindowDimensions();
  const questionMaxHeight = Math.min(height * 0.55, 460);
  const questionMinHeight = 260;

  const showSessionId = sessionId ?? (Array.isArray(routeSessionId) ? routeSessionId[0] : routeSessionId);

  const handleNext = async () => {
    await startNextQuestion();
    setAnswer('');
    setShowInput(false);
  };

  const handlePrimary = async () => {
    const canStartNext = status !== 'in_progress' || Boolean(currentResult) || !currentQuestion;
    if (canStartNext) {
      await handleNext();
      return;
    }

    if (!showInput) {
      setShowInput(true);
      return;
    }

    if (!answer.trim() || status !== 'in_progress' || currentResult) {
      return;
    }
    await submitBuzz(answer.trim());
    setAnswer('');
    setShowInput(false);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.metaBlock}>
          <ThemedText type="title">Multiplayer</ThemedText>
          <View style={styles.badgeRow}>
            {showSessionId ? (
              <View style={[styles.badge, { borderColor: brandColor }]}>
                <ThemedText type="defaultSemiBold" style={[styles.badgeText, { color: brandColor }]}>
                  Code: {showSessionId}
                </ThemedText>
              </View>
            ) : null}
            <View style={[styles.badge, { borderColor: borderColor }]}>
              <ThemedText style={styles.badgeText}>Status: {status}</ThemedText>
            </View>
          </View>
        </View>
        <View style={[styles.playersCard, { borderColor }]}>
          <ThemedText type="defaultSemiBold">Players</ThemedText>
          {players.length === 0 ? (
            <ThemedText style={styles.muted}>Waiting for players…</ThemedText>
          ) : (
            players.map((player) => (
              <ThemedText key={player.id} style={styles.player}>
                {player.name}
              </ThemedText>
            ))
          )}
        </View>
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.questionShell,
            { borderColor, minHeight: questionMinHeight, maxHeight: questionMaxHeight },
          ]}>
          <View style={styles.questionCardWrapper}>
            <QuestionCard
              tossup={currentQuestion}
              isLoading={loadingQuestion}
            error={status === 'ended' ? 'Game ended' : undefined}
            showAnswer={Boolean(currentResult)}
            isBuzzed={Boolean(currentResult)}
            result={currentResult}
            revealActive={!buzzLocked && status === 'in_progress'}
            onFullQuestionRevealChange={() => {}}
            revealSpeedOverride={settings?.revealSpeed}
            showRevealButton={false}
            showMeta={false}
          />
        </View>
        </View>
        <View style={[styles.controlCard, { borderColor }]}>
          {showInput && status === 'in_progress' && !currentResult ? (
            <View style={styles.buzzSection}>
              <AnswerInput
                value={answer}
                onChangeText={setAnswer}
                onSubmit={handlePrimary}
                disabled={Boolean(currentResult) || status !== 'in_progress'}
                autoFocus
              />
            </View>
          ) : null}

          <Pressable
            onPress={handlePrimary}
            disabled={loadingQuestion}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: brandColor,
                opacity: loadingQuestion ? 0.4 : pressed ? 0.85 : 1,
              },
            ]}>
            <ThemedText type="defaultSemiBold" style={styles.primaryLabel}>
              {status !== 'in_progress' || currentResult || !currentQuestion
                ? loadingQuestion
                  ? 'Loading…'
                  : 'Next question'
                : showInput
                  ? 'Submit'
                  : 'Buzz'}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  metaBlock: {
    flex: 1,
    gap: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    letterSpacing: 0.4,
  },
  playersCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    minWidth: 140,
    gap: 4,
    alignSelf: 'flex-start',
  },
  meta: {
    opacity: 0.9,
  },
  section: {
    marginTop: 8,
    gap: 4,
  },
  muted: {
    opacity: 0.6,
  },
  player: {
    opacity: 0.9,
  },
  body: {
    flex: 1,
    gap: 12,
  },
  questionShell: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    overflow: 'hidden',
  },
  questionCardWrapper: {
    flex: 1,
  },
  controlCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  helper: {
    opacity: 0.7,
  },
  buzzSection: {
    gap: 8,
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#fff',
    letterSpacing: 0.4,
  },
});
