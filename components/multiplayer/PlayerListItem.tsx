import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ConnectionDot } from './ConnectionDot';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { ConnectionStatus } from '@/types/multiplayer';
import { responsiveFont, scale, spacing, verticalScale, MIN_TOUCH_TARGET } from '@/utils/responsive';

type PlayerListItemProps = {
  name: string;
  color: string;
  isHost: boolean;
  isSelf: boolean;
  isReady: boolean;
  connectionStatus?: ConnectionStatus;
  canKick: boolean;
  onKick?: () => void;
};

export function PlayerListItem({
  name,
  color,
  isHost,
  isSelf,
  isReady,
  connectionStatus,
  canKick,
  onKick,
}: PlayerListItemProps) {
  const mutedColor = useThemeColor({}, 'muted');
  const borderColor = useThemeColor({}, 'border');

  return (
    <View style={[styles.container, { borderColor }]}>
      <View style={styles.left}>
        <View style={[styles.colorDot, { backgroundColor: color }]} />
        <View style={styles.nameContainer}>
          <ThemedText style={styles.name} numberOfLines={1}>
            {name}
            {isSelf ? ' (You)' : ''}
          </ThemedText>
          <View style={styles.badges}>
            {isHost && (
              <View style={[styles.badge, styles.hostBadge]}>
                <ThemedText style={styles.badgeText}>HOST</ThemedText>
              </View>
            )}
          </View>
        </View>
      </View>
      <View style={styles.right}>
        {isReady ? (
          <ThemedText style={styles.readyText}>Ready</ThemedText>
        ) : (
          <ThemedText style={[styles.notReadyText, { color: mutedColor }]}>Not Ready</ThemedText>
        )}
        <ConnectionDot status={connectionStatus} />
        {canKick && (
          <Pressable
            onPress={onKick}
            hitSlop={8}
            style={({ pressed }) => [styles.kickButton, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText style={styles.kickText}>X</ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(10),
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH_TARGET,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  colorDot: {
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  name: {
    fontSize: responsiveFont(15),
    fontWeight: '500',
    flexShrink: 1,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: verticalScale(2),
    borderRadius: scale(4),
  },
  hostBadge: {
    backgroundColor: '#F59E0B',
  },
  badgeText: {
    fontSize: responsiveFont(10),
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  readyText: {
    fontSize: responsiveFont(13),
    fontWeight: '600',
    color: '#16A34A',
  },
  notReadyText: {
    fontSize: responsiveFont(13),
  },
  kickButton: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kickText: {
    fontSize: responsiveFont(12),
    fontWeight: '700',
    color: '#fff',
  },
});
