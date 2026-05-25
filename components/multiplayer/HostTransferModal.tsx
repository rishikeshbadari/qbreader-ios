import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { Player } from '@/types/multiplayer';
import { MIN_TOUCH_TARGET, responsiveFont, scale, spacing, verticalScale } from '@/utils/responsive';

type Props = {
  visible: boolean;
  players: Player[];
  selectedPlayerId: string | null;
  defaultPlayerId: string | null;
  isSubmitting?: boolean;
  onSelectPlayer: (playerId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function HostTransferModal({
  visible,
  players,
  selectedPlayerId,
  defaultPlayerId,
  isSubmitting = false,
  onSelectPlayer,
  onCancel,
  onConfirm,
}: Props) {
  const borderColor = useThemeColor({}, 'border');
  const brandColor = useThemeColor({}, 'brand');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const surfaceColor = useThemeColor({}, 'surface');
  const canConfirm = Boolean(selectedPlayerId) && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <ThemedView style={[styles.card, { borderColor, backgroundColor: surfaceColor }]}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Transfer host</ThemedText>
            <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
              Choose who becomes host before you leave.
            </ThemedText>
          </View>

          <ScrollView contentContainerStyle={styles.playerList} showsVerticalScrollIndicator={false}>
            {players.map((player) => {
              const isSelected = selectedPlayerId === player.id;
              const isDefault = defaultPlayerId === player.id;

              return (
                <Pressable
                  key={player.id}
                  onPress={() => onSelectPlayer(player.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Transfer host to ${player.name}`}
                  accessibilityState={{ selected: isSelected }}
                  testID={`host-transfer-player-${player.id}`}
                  style={({ pressed }) => [
                    styles.playerRow,
                    {
                      borderColor: isSelected ? brandColor : borderColor,
                      backgroundColor: isSelected ? `${brandColor}22` : 'transparent',
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  <View style={styles.playerText}>
                    <ThemedText type="defaultSemiBold" style={styles.playerName}>
                      {player.name}
                    </ThemedText>
                    {isDefault ? (
                      <ThemedText style={[styles.defaultLabel, { color: mutedColor }]}>
                        Default
                      </ThemedText>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: isSelected ? brandColor : borderColor,
                        backgroundColor: isSelected ? brandColor : 'transparent',
                      },
                    ]}
                  />
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel host transfer"
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor, opacity: pressed ? 0.7 : 1 },
              ]}>
              <ThemedText type="defaultSemiBold" style={{ color: textColor }}>
                Cancel
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={!canConfirm}
              accessibilityRole="button"
              accessibilityLabel="Transfer host and leave"
              accessibilityState={{ disabled: !canConfirm }}
              testID="host-transfer-confirm"
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: brandColor,
                  opacity: !canConfirm ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}>
              <ThemedText type="defaultSemiBold" style={styles.primaryLabel}>
                {isSubmitting ? 'Leaving…' : 'Transfer & Leave'}
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(24),
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '72%',
  },
  header: {
    gap: spacing.xs,
  },
  subtitle: {
    fontSize: responsiveFont(14),
  },
  playerList: {
    gap: spacing.sm,
  },
  playerRow: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(16),
    paddingHorizontal: spacing.md,
    paddingVertical: verticalScale(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  playerText: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    fontSize: responsiveFont(16),
  },
  defaultLabel: {
    fontSize: responsiveFont(12),
    marginTop: verticalScale(2),
  },
  radio: {
    width: scale(18),
    height: scale(18),
    borderRadius: 999,
    borderWidth: scale(2),
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: scale(14),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryButton: {
    flex: 1.4,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: scale(14),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryLabel: {
    color: '#fff',
    fontSize: responsiveFont(15),
  },
});
