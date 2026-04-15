import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

const TUTORIAL_KEY = 'quizbowl:host_tutorial_seen';

const STEPS = [
  {
    title: "You're the host!",
    body: 'Share your game code with friends so they can join. Use the copy or share buttons below the code.',
  },
  {
    title: 'Wait for players',
    body: 'Players will appear in the list as they join. They need to mark themselves as Ready before you can start.',
  },
  {
    title: 'Start the game',
    body: "Once at least 2 players are ready, tap Start Game. A 3-second countdown will begin, and then you're off!",
  },
];

export function HostTutorial() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_KEY).then(val => {
      if (val !== 'true') {
        setVisible(true);
      }
    });
  }, []);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      setVisible(false);
      AsyncStorage.setItem(TUTORIAL_KEY, 'true');
    }
  };

  const handleSkip = () => {
    setVisible(false);
    AsyncStorage.setItem(TUTORIAL_KEY, 'true');
  };

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.stepIndicator}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === step ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>

        <ThemedText style={styles.title}>{current.title}</ThemedText>
        <ThemedText style={styles.body}>{current.body}</ThemedText>

        <View style={styles.actions}>
          <Pressable onPress={handleSkip} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <ThemedText style={styles.skipText}>Skip</ThemedText>
          </Pressable>
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [styles.nextButton, { opacity: pressed ? 0.8 : 1 }]}>
            <ThemedText style={styles.nextText}>
              {step < STEPS.length - 1 ? 'Next' : 'Got it'}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: scale(16),
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
    gap: spacing.md,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
  },
  dotActive: {
    backgroundColor: '#4338CA',
  },
  dotInactive: {
    backgroundColor: '#D1D5DB',
  },
  title: {
    fontSize: responsiveFont(20),
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  body: {
    fontSize: responsiveFont(15),
    color: '#475569',
    textAlign: 'center',
    lineHeight: responsiveFont(22),
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  skipText: {
    fontSize: responsiveFont(14),
    color: '#94A3B8',
  },
  nextButton: {
    backgroundColor: '#4338CA',
    borderRadius: scale(8),
    paddingHorizontal: spacing.lg,
    paddingVertical: verticalScale(10),
  },
  nextText: {
    fontSize: responsiveFont(14),
    fontWeight: '600',
    color: '#fff',
  },
});
